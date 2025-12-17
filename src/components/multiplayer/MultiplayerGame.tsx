import React, { useMemo } from 'react';
import { useMultiplayer } from '../../context/MultiplayerContext';
import { useGame } from '../../context/GameContext';
import { useAuth } from '../../context/AuthContext';
import GameMap from '../map/GameMap';

const MultiplayerGame: React.FC = () => {
    const { gameState, players, submitAnswer, leaveRoom } = useMultiplayer();
    const { filteredCountries } = useGame(); // Use this to lookup country details
    const auth = useAuth();

    const [interstitial, setInterstitial] = React.useState<string | null>(null);

    // Audio Refs (Simple oscillator beeps for now or placeholder) (Optional, keeping simple visual first)
    // To make it cool we need assets, but we can do a visual countdown first.

    // Effect: Trigger 3-2-1 on turn change
    React.useEffect(() => {
        if (!gameState?.current_turn) return;

        // Start Sequence
        setInterstitial('3');
        const t1 = setTimeout(() => setInterstitial('2'), 1000);
        const t2 = setTimeout(() => setInterstitial('1'), 2000);
        const t3 = setTimeout(() => setInterstitial('¡TU TURNO!'), 3000);
        const t4 = setTimeout(() => setInterstitial(null), 4000);

        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
        };
    }, [gameState?.current_turn]);


    // Derived state
    const currentTurnPlayer = useMemo(() => {
        return players.find(p => p.player_id === gameState?.current_turn);
    }, [players, gameState?.current_turn]);

    const isMyTurn = auth.user?.id === gameState?.current_turn;

    // Find target country object
    const targetCountryCode = gameState?.current_question?.country;
    const targetCountry = useMemo(() => {
        if (!targetCountryCode || !filteredCountries) return null;
        // Try to match cca3 or name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return filteredCountries.find((c: any) => c.cca3 === targetCountryCode || c.name.common === targetCountryCode);
    }, [targetCountryCode, filteredCountries]);


    // Handle Guess
    const handleGuess = async (code: string) => {
        if (interstitial) return; // Block during interstitial
        if (!isMyTurn) return; // Ignore if not my turn
        if (!gameState) return;

        // Verify answer
        const isCorrect = code === targetCountryCode || code === targetCountry?.cca3;

        console.log(`Guessed: ${code}, Target: ${targetCountryCode}, Correct: ${isCorrect}`);

        // Generate next question (client-side for now, ideally backend)
        let nextQuestion = undefined;
        if (filteredCountries && filteredCountries.length > 0) {
            const randomCountry = filteredCountries[Math.floor(Math.random() * filteredCountries.length)];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nextQuestion = { type: 'flag', country: (randomCountry as any).cca3, options: [] };
        }

        await submitAnswer(isCorrect, nextQuestion);
    };

    if (!gameState) return <div>Loading Game State...</div>;

    return (
        <div className="w-full h-screen bg-night text-white flex flex-col relative">

            {/* INTERSTITIAL OVERLAY */}
            {interstitial && (
                <div className="absolute inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
                    <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-asia to-emerald-400 animate-bounce">
                        {interstitial}
                    </div>
                </div>
            )}

            {/* Background Music */}
            <audio autoPlay loop>
                <source src="/music/background_loop.mp3" type="audio/mp3" />
                Your browser does not support the audio element.
            </audio>

            {/* Top Bar: HUD */}
            <header className="px-6 py-4 bg-deep/80 border-b border-white/10 flex justify-between items-center z-50">
                <div className="flex items-center gap-4">
                    <div className="text-2xl font-black text-brand-europe">MAP BATTLE</div>
                    <div className={`px-3 py-1 rounded text-sm font-mono transition-all ${gameState.time_left <= 5 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-white/10 text-soft-gray'
                        }`}>
                        TIME: {gameState.time_left}s
                    </div>
                </div>

                <div className="flex-1 flex justify-center">
                    {targetCountry ? (
                        <div className="text-center animate-pulse">
                            <span className="text-sm text-soft-gray block">LOCALIZA</span>
                            {/* Check if flag property exists or handle generic */}
                            <span className="text-xl md:text-3xl font-black text-white">
                                {targetCountry.name?.common || targetCountryCode}
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {(targetCountry as any).flag}
                            </span>
                        </div>
                    ) : (
                        <div className="text-soft-gray">Preparando siguiente objetivo...</div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className={`text-right ${isMyTurn ? 'text-brand-europe font-bold' : 'text-soft-gray'}`}>
                        {isMyTurn ? "TU TURNO" : `Turno de: ${currentTurnPlayer?.profile?.username || 'Jugador'}`}
                    </div>
                    <button
                        onClick={() => {
                            if (window.confirm("¿Seguro que quieres rendirte?")) {
                                leaveRoom();
                            }
                        }}
                        className="bg-red-500/20 text-red-400 hover:bg-red-500/40 px-3 py-1 rounded text-xs border border-red-500/30 transition-colors"
                    >
                        RENDIRSE
                    </button>
                </div>
            </header>

            {/* Main Content: Map + Sidebar */}
            <div className="flex-1 flex overflow-hidden">
                {/* Players Sidebar (Left) */}
                <aside className="w-64 bg-deep/50 border-r border-white/5 p-4 overflow-y-auto hidden md:block">
                    <h3 className="font-bold mb-4 text-sm text-soft-gray uppercase tracking-wider">Jugadores</h3>
                    <div className="space-y-3">
                        {players.map(p => (
                            <div key={p.player_id} className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${gameState.current_turn === p.player_id
                                ? 'bg-brand-europe/20 border-brand-europe/50'
                                : 'bg-white/5 border-white/10'
                                }`}>
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                    {p.profile?.avatar_url ? (
                                        <img src={p.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-xs font-bold">{(p.profile?.username?.[0] || '?').toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-sm truncate">{p.profile?.username || 'Anónimo'}</div>
                                    <div className="flex justify-between text-xs text-soft-gray mt-1">
                                        <span>❤️ {p.lives}</span>
                                        <span>🏆 {p.score}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Map Area */}
                <main className="flex-1 relative">
                    <GameMap
                        onGuess={handleGuess}
                        overrideTarget={targetCountry}
                    />

                    {/* Turn Indicator Overlay (Mobile/Visual) & Interaction Blocker */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
                        {!isMyTurn && !interstitial && (
                            <div className="bg-black/60 backdrop-blur text-white px-4 py-2 rounded-full text-sm border border-white/10">
                                Espera tu turno
                            </div>
                        )}
                    </div>

                    {/* Hard Interaction Blocker for Non-Turn Players */}
                    {(!isMyTurn || !!interstitial) && (
                        <div className="absolute inset-0 z-50 bg-transparent cursor-not-allowed"
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log("🚫 Interaction blocked by overlay");
                            }}
                        />
                    )}
                </main>
            </div>
        </div>
    );
};

export default MultiplayerGame;
