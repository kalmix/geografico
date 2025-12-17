import React, { useState } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import { useAuth } from '../../context/AuthContext';
import { useGame } from '../../context/GameContext';

const Lobby: React.FC = () => {
    const { room, players, leaveRoom, toggleReady, startGame, isHost, error, sendInvite } = useMultiplayer();
    const { user } = useAuth();
    const { filteredCountries } = useGame();

    const [inviteId, setInviteId] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Debugging Logs
    React.useEffect(() => {
        console.log('--- LOBBY RENDER DEBUG ---');
        console.log('Current User:', user?.id);
        console.log('Room Host:', room?.host_id);
        console.log('Am I Host?:', isHost);
        console.log('Players List:', players);
        console.log('Room Status:', room?.status);
        console.log('--------------------------');
    }, [room, players, user, isHost]);

    if (!room) return null;

    const copyCode = () => {
        navigator.clipboard.writeText(room.room_code);
        // Could add toast here
    };

    const handleStartGame = async () => {
        if (!filteredCountries || filteredCountries.length === 0) {
            console.error("No countries available to start game");
            return;
        }
        const randomCountry = filteredCountries[Math.floor(Math.random() * filteredCountries.length)];
        const question = { type: 'flag', country: randomCountry.cca3, options: [] };

        await startGame(question);
    };

    const handleSendInvite = async () => {
        if (!inviteId.trim()) return;
        await sendInvite(inviteId.trim());
        setInviteId('');
        setShowInviteModal(false);
    };

    const allReady = players.length > 0 && players.every(p => p.is_ready);
    const canStart = isHost && allReady && players.length >= 2;

    return (
        <div className="w-full max-w-4xl mx-auto p-6 text-white relative">
            <header className="flex justify-between items-center mb-12">
                <div>
                    <h2 className="text-3xl font-black mb-1">Sala de Espera</h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-soft-gray text-lg">CÓDIGO:</span>
                            <button
                                onClick={copyCode}
                                className="bg-white/10 px-4 py-1 rounded-lg font-mono text-xl tracking-widest hover:bg-white/20 transition-all flex items-center gap-2"
                            >
                                {room.room_code}
                                <svg className="w-4 h-4 text-soft-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                        </div>

                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="text-sm bg-brand-asia/20 text-brand-asia hover:bg-brand-asia/40 px-3 py-1.5 rounded-lg transition-colors border border-brand-asia/30"
                        >
                            + Invitar
                        </button>
                    </div>
                </div>
                <button
                    onClick={leaveRoom}
                    className="text-red-400 hover:text-red-300 font-medium px-4 py-2 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-all"
                >
                    Salir
                </button>
            </header>

            {error && (
                <div className="bg-red-500/20 text-red-100 p-4 rounded-xl mb-8 border border-red-500/50 text-center">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {/* Player Cards */}
                {players.map((player) => {
                    const isMe = player.player_id === user?.id;
                    return (
                        <div
                            key={player.player_id}
                            className={`p-6 rounded-2xl border transition-all ${player.is_ready
                                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-emerald-500/10'
                                : 'bg-white/5 border-white/10'
                                }`}
                        >
                            <div className="flex items-center gap-4 mb-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${player.is_ready ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/10 text-soft-gray'
                                    }`}>
                                    {player.profile?.avatar_url ? (
                                        <img src={player.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        (player.profile?.username?.[0] || '?').toUpperCase()
                                    )}
                                </div>
                                <div className="overflow-hidden">
                                    <h3 className="font-bold truncate flex items-center gap-2">
                                        {player.profile?.username || 'Jugador'}
                                        {player.player_id === room.host_id && (
                                            <span title="Anfitrión" className="text-yellow-400">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                            </span>
                                        )}
                                        {isMe && <span className="text-xs text-soft-gray font-normal">(Tú)</span>}
                                    </h3>
                                    <p className={`text-xs ${player.is_ready ? 'text-emerald-400' : 'text-soft-gray'}`}>
                                        {player.is_ready ? '¡Listo!' : 'No Listo'}
                                    </p>
                                </div>
                            </div>
                            {isMe && (
                                <button
                                    onClick={toggleReady}
                                    className={`w-full py-2 rounded-lg font-bold transition-all ${player.is_ready
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        : 'bg-white/10 hover:bg-white/20 text-white'
                                        }`}
                                >
                                    {player.is_ready ? 'Cancelar' : '¡Estoy Listo!'}
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Empty Slots */}
                {[...Array(Math.max(0, 6 - players.length))].map((_, i) => (
                    <div key={`empty-${i}`} className="p-6 rounded-2xl border border-white/5 bg-transparent opacity-30 flex items-center justify-center border-dashed">
                        <span className="text-soft-gray">Esperando...</span>
                    </div>
                ))}
            </div>

            <footer className="fixed bottom-0 left-0 w-full p-6 bg-deep border-t border-white/10 z-50">
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <div className="text-sm text-soft-gray">
                        {players.length} / 6 Jugadores
                    </div>
                    {isHost && (
                        <button
                            onClick={handleStartGame}
                            disabled={!canStart}
                            className="bg-brand-europe hover:bg-blue-600 px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-brand-europe/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Comenzar Partida
                        </button>
                    )}
                    {!isHost && (
                        <div className="text-soft-gray italic">
                            Esperando al anfitrión...
                        </div>
                    )}
                </div>
            </footer>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-deep p-6 rounded-2xl border border-white/20 w-full max-w-sm shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-white">Invitar Jugador</h3>
                        <p className="text-sm text-soft-gray mb-4">Ingresa el ID del usuario que quieres invitar.</p>
                        <input
                            type="text"
                            value={inviteId}
                            onChange={(e) => setInviteId(e.target.value)}
                            className="w-full bg-black/40 border border-white/20 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-brand-asia"
                            placeholder="UUID del usuario"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="flex-1 py-3 rounded-lg border border-white/10 text-soft-gray hover:bg-white/5"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSendInvite}
                                className="flex-1 py-3 rounded-lg bg-brand-asia hover:bg-emerald-600 text-white font-bold"
                            >
                                Enviar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Lobby;
