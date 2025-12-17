import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

// Types matches DB schema approximately
export interface Room {
    id: string;
    room_code: string;
    host_id: string;
    game_mode: string;
    status: 'waiting' | 'playing' | 'finished';
    max_players: number;
    created_at: string;
}

export interface Player {
    id: string; // usually a join table id, but we might verify
    room_id: string;
    player_id: string;
    score: number;
    lives: number;
    is_ready: boolean;
    joined_at: string;
    // We might join with profiles to get display names, handled in UI or separate fetch
    profile?: {
        username: string;
        avatar_url: string;
    };
}

export interface GameState {
    id: string;
    room_id: string;
    current_turn: string; // player_id
    current_question: any; // JSON or specific structure
    round: number;
    time_left: number;
    updated_at: string;
}

interface MultiplayerContextType {
    room: Room | null;
    players: Player[];
    gameState: GameState | null;
    loading: boolean;
    error: string | null;
    createRoom: (gameMode?: string) => Promise<string | null>; // returns room code
    joinRoom: (code: string) => Promise<boolean>;
    leaveRoom: () => Promise<void>;
    toggleReady: () => Promise<void>;
    startGame: (initialQuestion: any) => Promise<void>;
    submitAnswer: (isCorrect: boolean, nextQuestion?: any, isTimeout?: boolean) => Promise<void>;
    sendInvite: (friendId: string) => Promise<void>;
    declineInvite: (inviteId: string) => Promise<void>;
    invites: any[];
    isHost: boolean;
    debugLogs: string[];
    addLog: (msg: string) => void;
    refreshPlayers: () => Promise<void>;
}

const MultiplayerContext = createContext<MultiplayerContextType | undefined>(undefined);

export const MultiplayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [room, setRoom] = useState<Room | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [roomChannel, setRoomChannel] = useState<RealtimeChannel | null>(null);
    const [gameChannel, setGameChannel] = useState<RealtimeChannel | null>(null);
    const [invites, setInvites] = useState<any[]>([]);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);

    const addLog = useCallback((msg: string) => {
        const time = new Date().toLocaleTimeString();
        setDebugLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    }, []);

    const fetchPlayers = useCallback(async (roomId: string) => {
        addLog(`🔄 fetching players for ${roomId}...`);
        const { data, error } = await supabase.rpc('get_room_players', {
            p_room_id: roomId
        });

        if (error) {
            addLog(`❌ Error fetching players: ${error.message}`);
            return;
        }

        if (data) {
            // addLog(`✅ Players received: ${data.length}`);
            if (data.length > 0) {
                // Log raw data to verify the new RPC structure
                addLog(`👤 RPC Data [0]: ${JSON.stringify(data[0])}`);
            }

            // Map flat RPC result to application Player interface
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedPlayers = data.map((p: any) => ({
                id: p.id,
                room_id: p.room_id,
                player_id: p.player_id,
                score: p.score,
                lives: p.lives,
                is_ready: p.is_ready,
                joined_at: p.joined_at,
                profile: {
                    username: p.username || 'Sin Nombre',
                    avatar_url: p.avatar_url
                }
            }));
            setPlayers(mappedPlayers);
        }
    }, [addLog]);

    // 4. Lobby Subscription
    const subscribeToRoom = useCallback((roomId: string) => {
        addLog(`📡 Subscribing to room:${roomId}`);
        const channel = supabase
            .channel(`room:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'room_players',
                    filter: `room_id=eq.${roomId}`
                },
                async (payload) => {
                    addLog(`🔔 Lobby update: ${payload.eventType}`);
                    // fetchPlayers(roomId); // REMOVED to prevent loop

                    if (payload.eventType === 'INSERT') {
                        // Need to fetch profile for the new player
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('username, avatar_url')
                            .eq('id', payload.new.player_id)
                            .single();

                        setPlayers(prev => {
                            // Check if already exists to prevent duplicates
                            if (prev.find(p => p.id === payload.new.id)) return prev;

                            const newPlayer: Player = {
                                id: payload.new.id,
                                room_id: payload.new.room_id,
                                player_id: payload.new.player_id,
                                score: payload.new.score,
                                lives: payload.new.lives,
                                is_ready: payload.new.is_ready,
                                joined_at: payload.new.created_at || new Date().toISOString(),
                                profile: {
                                    username: profile?.username || 'Sin Nombre',
                                    avatar_url: profile?.avatar_url
                                }
                            };
                            return [...prev, newPlayer];
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        setPlayers(prev => prev.map(p => {
                            if (p.id === payload.new.id) {
                                // Merge new data but KEEP the profile
                                return {
                                    ...p,
                                    score: payload.new.score,
                                    lives: payload.new.lives,
                                    is_ready: payload.new.is_ready,
                                    // other fields if needed
                                };
                            }
                            return p;
                        }));
                    } else if (payload.eventType === 'DELETE') {
                        setPlayers(prev => prev.filter(p => p.id !== payload.old.id));
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'rooms',
                    filter: `id=eq.${roomId}`
                },
                (payload) => {
                    console.log('Room update', payload);
                    setRoom(payload.new as Room);
                }
            )
            .subscribe((status) => {
                addLog(`📡 Room Channel Status: ${status}`);
                if (status === 'SUBSCRIBED') {
                    // Only fetch once on subscribe if needed, but normally fetchPlayers is called before this
                    // We can leave it here or remove it if joinRoom calls it. 
                    // Logic: joinRoom calls fetchPlayers, then subscribe. 
                    // We might not need to call it here again to adhere strictly to "Snapshot once"
                    // But for safety against race conditions during connection, one check is okay?
                    // User said: "fetchInitialPlayers ... SOLO UNA VEZ".
                    // joinRoom already does it. Let's REMOVE it here to be safe and strict.
                }
            });

        setRoomChannel(channel);
    }, [addLog]);

    const isHost = room?.host_id === user?.id;

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            roomChannel?.unsubscribe();
            gameChannel?.unsubscribe();
        };
    }, [roomChannel, gameChannel]);

    // 9. Invitations Subscription
    useEffect(() => {
        if (!user) return;

        // Fetch initial invites
        supabase.from('room_invites').select('*, room:rooms(room_code, game_mode), sender:profiles(username)')
            .eq('to_user', user.id)
            .then(({ data }) => {
                if (data) setInvites(data);
            });

        const channel = supabase
            .channel(`invites:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'room_invites',
                    filter: `to_user=eq.${user.id}`
                },
                async (payload) => {
                    console.log('Invite received', payload);
                    // Fetch full details
                    const { data } = await supabase.from('room_invites')
                        .select('*, room:rooms(room_code, game_mode), sender:profiles(username)')
                        .eq('id', payload.new.id)
                        .single();

                    if (data) setInvites(prev => [...prev, data]);
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [user?.id]);

    // 7. Game Subscription
    const subscribeToGame = useCallback((roomId: string) => {
        addLog(`🎮 Subscribing to game:${roomId}`);
        const channel = supabase
            .channel(`game:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to INSERT (start) and UPDATE (turns)
                    schema: 'public',
                    table: 'game_state',
                    filter: `room_id=eq.${roomId}`
                },
                (payload) => {
                    addLog(`🎲 Game state event: ${payload.eventType}`);
                    setGameState(payload.new as GameState);
                }
            )
            .subscribe();

        setGameChannel(channel);
    }, [addLog]);

    // Safety: Fetch game state if room is playing but we don't have it (Refresh / Late join)
    useEffect(() => {
        if (room?.status === 'playing' && !gameState) {
            addLog(`⚠️ Room is playing but no game state. Fetching...`);
            supabase.from('game_state')
                .select('*')
                .eq('room_id', room.id)
                .single()
                .then(({ data, error }) => {
                    if (data) {
                        addLog(`✅ Game state fetched manually.`);
                        setGameState(data as GameState);
                    }
                    if (error) {
                        addLog(`❌ Error fetching game state: ${error.message}`);
                    }
                });
        }
    }, [room?.status, room?.id, gameState, addLog]);

    // 2. Create Room
    const createRoom = async (gameMode: string = 'deathmatch') => {
        if (!user) return null;
        setLoading(true);
        setError(null);

        try {
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            const { data: newRoom, error: roomError } = await supabase
                .from('rooms')
                .insert({
                    room_code: roomCode,
                    host_id: user.id,
                    game_mode: gameMode,
                    max_players: 6
                })
                .select()
                .single();

            if (roomError) throw roomError;

            const { error: playerError } = await supabase.from('room_players').insert({
                room_id: newRoom.id,
                player_id: user.id,
                is_ready: true // Host is always ready
            });

            if (playerError) throw playerError;

            setRoom(newRoom);
            await fetchPlayers(newRoom.id);
            subscribeToRoom(newRoom.id);
            subscribeToGame(newRoom.id);

            return roomCode;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    // 3. Join Room
    const joinRoom = async (code: string) => {
        addLog(`🚪 Joining room ${code}...`);
        if (!user) {
            addLog(`❌ No user found for join.`);
            return false;
        }
        setLoading(true);
        setError(null);

        try {
            const { data: foundRoom, error: fetchError } = await supabase
                .from('rooms')
                .select('*')
                .eq('room_code', code)
                .single();

            if (fetchError || !foundRoom) throw new Error('Room not found');
            addLog(`🏠 Room found: ${foundRoom.id}`);

            const { data: existingPlayer } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', foundRoom.id)
                .eq('player_id', user.id)
                .maybeSingle();

            if (existingPlayer) {
                addLog(`⚠️ Player already in room. Updating ready status...`);
                await supabase
                    .from('room_players')
                    .update({ is_ready: true })
                    .eq('room_id', foundRoom.id)
                    .eq('player_id', user.id);
            } else {
                addLog(`➕ Inserting player record...`);
                // ... (rest logic same)
                const { count } = await supabase
                    .from('room_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', foundRoom.id);

                if (count && count >= (foundRoom.max_players || 6)) throw new Error('Room is full');

                const { error: joinError } = await supabase.from('room_players').insert({
                    room_id: foundRoom.id,
                    player_id: user.id,
                    is_ready: true
                });

                if (joinError) throw joinError;
            }

            setRoom(foundRoom);
            await fetchPlayers(foundRoom.id);
            subscribeToRoom(foundRoom.id);
            subscribeToGame(foundRoom.id);

            return true;
        } catch (err: any) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const leaveRoom = async () => {
        if (!user || !room) return;

        await supabase
            .from('room_players')
            .delete()
            .eq('room_id', room.id)
            .eq('player_id', user.id);

        setRoom(null);
        setPlayers([]);
        setGameState(null);
        roomChannel?.unsubscribe();
        gameChannel?.unsubscribe();
        setRoomChannel(null);
        setGameChannel(null);
    };

    // Check for "Last Man Standing" / Win Condition
    useEffect(() => {
        if (room?.status === 'playing' && players.length === 1 && !loading) {
            // Only one player left?
            const winner = players[0];
            addLog(`🏆 Game Over! Winner: ${winner.profile?.username}`);

            // Should we update DB? Or just show it? 
            // If the other player disconnected properly, DB room_players is updated.
            // We can set a local winner state or update room status.
            // Let's rely on UI to show "Waiting" or "Winner" based on this state.
            // But usually we want to explicit finish.

            if (isHost) { // Only one person triggers the update
                supabase.from('rooms')
                    .update({ status: 'finished' })
                    .eq('id', room.id)
                    .then(({ error }) => {
                        if (error) addLog(`❌ Error finishing game: ${error.message}`);
                    });
            }
        }
    }, [players.length, room?.status, isHost, loading, room?.id, addLog]);

    // 5. Ready System
    const toggleReady = async () => {
        if (!user || !room) return;

        const me = players.find(p => p.player_id === user.id);
        if (!me) {
            addLog('❌ Cannot toggle ready: Player not found in list');
            return;
        }

        addLog(`🔄 Toggling ready status to: ${!me.is_ready}`);

        const { error } = await supabase
            .from('room_players')
            .update({ is_ready: !me.is_ready })
            .eq('room_id', room.id)
            .eq('player_id', user.id);

        if (error) {
            addLog(`❌ Error toggling ready: ${error.message}`);
        }
    };

    // 6. Start Game
    const startGame = async (initialQuestion: any) => {
        addLog(`🎮 Attempting to start game...`);
        if (!user || !room) {
            addLog(`❌ Start failed: Missing user (${!!user}) or room (${!!room})`);
            return;
        }
        if (room.host_id !== user.id) {
            addLog(`❌ Start failed: User is not host`);
            return;
        }

        const allReady = players.every(p => p.is_ready);
        addLog(`👥 Players status: ${players.length} players. All Ready? ${allReady}. Details: ${JSON.stringify(players.map(p => ({ id: p.player_id, ready: p.is_ready })))}`);

        if (!allReady) {
            setError("Not all players are ready");
            addLog(`❌ Start failed: Not all players are ready`);
            return;
        }

        try {
            addLog(`📝 Updating room status to 'playing'...`);
            const { error: roomError } = await supabase.from('rooms')
                .update({ status: 'playing' })
                .eq('id', room.id);

            if (roomError) {
                throw roomError;
            }

            addLog(`🎲 Inserting initial game state...`);
            const { error: gameError } = await supabase.from('game_state').insert({
                room_id: room.id,
                current_turn: room.host_id,
                current_question: initialQuestion,
                round: 1,
                time_left: 30
            });

            if (gameError) {
                throw gameError;
            }

            addLog(`✅ Game started successfully!`);
        } catch (err: any) {
            setError(err.message);
            addLog(`❌ Error starting game: ${err.message}`);
        }
    };

    // 8. Player Response
    const submitAnswer = async (isCorrect: boolean, nextQuestion?: any) => {
        if (!user || !room || !gameState) return;

        const me = players.find(p => p.player_id === user.id);
        if (!me) return;

        if (isCorrect) {
            await supabase
                .from('room_players')
                .update({ score: me.score + 1 })
                .eq('room_id', room.id)
                .eq('player_id', user.id);
        } else {
            await supabase
                .from('room_players')
                .update({ lives: me.lives - 1 })
                .eq('room_id', room.id)
                .eq('player_id', user.id);
        }

        // Rotate turn logic (Client driven for simplicity as per requirements)
        if (nextQuestion) {
            const currentIndex = players.findIndex(p => p.player_id === gameState.current_turn);
            const nextIndex = (currentIndex + 1) % players.length;
            const nextPlayerId = players[nextIndex].player_id;

            await supabase.from('game_state')
                .update({
                    current_turn: nextPlayerId,
                    current_question: nextQuestion,
                    round: gameState.round + (nextIndex === 0 ? 1 : 0), // Increment round if back to first player? Optional
                    time_left: 30
                })
                .eq('room_id', room.id);
        }
    };

    // Send Invite
    const sendInvite = async (friendId: string) => {
        if (!user || !room) return;
        await supabase.from('room_invites').insert({
            room_id: room.id,
            from_user: user.id,
            to_user: friendId
        });
    };

    // Decline/Accept
    const declineInvite = async (inviteId: string) => {
        await supabase.from('room_invites').delete().eq('id', inviteId);
        setInvites(prev => prev.filter(i => i.id !== inviteId));
    };

    const refreshPlayers = async () => {
        if (room?.id) await fetchPlayers(room.id);
    };

    return (
        <MultiplayerContext.Provider value={{
            room, players, gameState, loading, error,
            createRoom, joinRoom, leaveRoom, toggleReady, startGame, submitAnswer, isHost,
            invites, sendInvite, declineInvite,
            debugLogs, addLog, refreshPlayers
        }}>
            {children}
        </MultiplayerContext.Provider>
    );
};

export const useMultiplayer = () => {
    const context = useContext(MultiplayerContext);
    if (!context) {
        throw new Error('useMultiplayer must be used within a MultiplayerProvider');
    }
    return context;
};
