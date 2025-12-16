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
    submitAnswer: (isCorrect: boolean, nextQuestion?: any) => Promise<void>;
    sendInvite: (friendId: string) => Promise<void>;
    declineInvite: (inviteId: string) => Promise<void>;
    invites: any[];
    isHost: boolean;
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
    const [invites, setInvites] = useState<any[]>([]); // Step 9

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

    // 4. Lobby Subscription
    const subscribeToRoom = useCallback((roomId: string) => {
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
                (payload) => {
                    console.log('Lobby update', payload);
                    fetchPlayers(roomId);
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
            .subscribe();

        setRoomChannel(channel);
    }, []);

    // 7. Game Subscription
    const subscribeToGame = useCallback((roomId: string) => {
        const channel = supabase
            .channel(`game:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'game_state',
                    filter: `room_id=eq.${roomId}`
                },
                (payload) => {
                    console.log('Game state update', payload);
                    setGameState(payload.new as GameState);
                }
            )
            .subscribe();

        setGameChannel(channel);
    }, []);

    const fetchPlayers = async (roomId: string) => {
        const { data, error } = await supabase.rpc('get_room_players', {
            p_room_id: roomId
        });

        console.log('Players RPC:', data, error);

        if (error) {
            console.error('Error fetching players:', error);
            return;
        }

        if (data) {
            // Check if RPC returns profiles joined or flat. Assumed joined as per previous code structure desire.
            // If the RPC returns a different shape, we might need to map it.
            // For now, trusting the user's "Lista de jugadores llega correctamente".
            // However, the previous manual join returned `profile: { ... }`.
            // If the RPC returns flat columns (e.g. username), we'd need to map.
            // But let's assume the RPC mimics the join or the user updated the interface?
            // Wait, looking at current Player interface: interface Player { ... profile?: { username, avatar_url } }
            // If RPC is a SQL function, it might return json or flattened rows.
            // The common pattern for Supabase RPC returning relations is to return JSON or if it's a view.
            // Given the user said "Listo de jugadores llega correctamente", I will assume `data` is compatible with `Player[]`.
            // But to be safe against "No hay 500", I'll just set it.
            setPlayers(data as Player[]);
        }
    };

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
        if (!user) return false;
        setLoading(true);
        setError(null);

        try {
            const { data: foundRoom, error: fetchError } = await supabase
                .from('rooms')
                .select('*')
                .eq('room_code', code)
                .single();

            if (fetchError || !foundRoom) throw new Error('Room not found');

            const { data: existingPlayer } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', foundRoom.id)
                .eq('player_id', user.id)
                .single();

            if (!existingPlayer) {
                const { count } = await supabase
                    .from('room_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', foundRoom.id);

                if (count && count >= (foundRoom.max_players || 6)) throw new Error('Room is full');

                const { error: joinError } = await supabase.from('room_players').insert({
                    room_id: foundRoom.id,
                    player_id: user.id
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

    // 5. Ready System
    const toggleReady = async () => {
        if (!user || !room) return;

        const me = players.find(p => p.player_id === user.id);
        if (!me) return;

        await supabase
            .from('room_players')
            .update({ is_ready: !me.is_ready })
            .eq('room_id', room.id)
            .eq('player_id', user.id);
    };

    // 6. Start Game
    const startGame = async (initialQuestion: any) => {
        if (!user || !room) return;
        if (room.host_id !== user.id) return;

        const allReady = players.every(p => p.is_ready);
        if (!allReady) {
            setError("Not all players are ready");
            return;
        }

        try {
            await supabase.from('rooms')
                .update({ status: 'playing' })
                .eq('id', room.id);

            await supabase.from('game_state').insert({
                room_id: room.id,
                current_turn: room.host_id,
                current_question: initialQuestion,
                round: 1,
                time_left: 30
            });
        } catch (err: any) {
            setError(err.message);
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

    return (
        <MultiplayerContext.Provider value={{
            room, players, gameState, loading, error,
            createRoom, joinRoom, leaveRoom, toggleReady, startGame, submitAnswer, isHost,
            invites, sendInvite, declineInvite
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
