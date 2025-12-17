import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMultiplayer } from '../../context/MultiplayerContext';
import { useAuth } from '../../context/AuthContext';
import CreateJoinRoom from '../multiplayer/CreateJoinRoom';
import Lobby from '../multiplayer/Lobby';
import MultiplayerGame from '../multiplayer/MultiplayerGame';

// Internal Debug Component
const DebugConsole = () => {
    const { debugLogs, refreshPlayers } = useMultiplayer();
    const [isOpen, setIsOpen] = useState(false);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 bg-black/80 text-green-400 font-mono text-xs px-3 py-2 rounded border border-green-500/30 z-[9999]"
            >
                📟 DEBUG LOGS
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 w-96 h-64 bg-black/90 text-green-400 font-mono text-xs rounded border border-green-500/30 z-[9999] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-2 border-b border-green-500/30 bg-green-500/10">
                <span className="font-bold">SYSTEM LOGS</span>
                <div className="flex gap-2">
                    <button onClick={refreshPlayers} className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded hover:bg-blue-500/40">REFRESH LIST</button>
                    <button onClick={() => window.location.reload()} className="text-xs bg-white/10 px-2 py-1 rounded hover:bg-white/20">RELOAD APP</button>
                    <button onClick={() => setIsOpen(false)} className="text-green-500 hover:text-white">✕</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {debugLogs.length === 0 && <span className="opacity-50">No logs yet...</span>}
                {debugLogs.map((log, i) => (
                    <div key={i} className="break-all border-b border-white/5 pb-0.5 mb-0.5 last:border-0">
                        {log}
                    </div>
                ))}
            </div>
        </div>
    );
};

const MultiplayerPage: React.FC = () => {
    const { room } = useMultiplayer();
    const { user } = useAuth();
    const navigate = useNavigate();

    // Redirect if not authenticated
    if (!user) {
        navigate('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-night bg-[url('/grid-pattern.svg')] relative overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-europe/5 blur-[120px] rounded-full mix-blend-screen -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-brand-americas/5 blur-[100px] rounded-full mix-blend-screen translate-y-1/3 -translate-x-1/3"></div>
            </div>

            <div className="relative z-10 pt-10">
                <button
                    onClick={() => navigate('/')}
                    className="absolute top-6 left-6 text-soft-gray hover:text-white flex items-center gap-2 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Volver
                </button>

                {/* Main Content Area */}
                <div className="flex flex-col items-center justify-center">
                    {(!room || room.status === 'waiting') && (
                        room ? <Lobby /> : <CreateJoinRoom onCancel={() => navigate('/')} />
                    )}

                    {room && room.status === 'playing' && (
                        <MultiplayerGame />
                    )}
                </div>
            </div>

            <DebugConsole />
        </div>
    );
};

export default MultiplayerPage;
