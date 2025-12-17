
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const { signInWithGoogle, signInWithFacebook, signInWithEmail, signUpWithEmail } = useAuth();
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (mode === 'signup') {
                await signUpWithEmail(email, password);
                alert('Account created! Please check your email for verification.');
            } else {
                await signInWithEmail(email, password);
            }
            onClose();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-night/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-deep border border-white/10 rounded-2xl w-full max-w-md p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-soft-gray hover:text-white transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>

                <div className="text-center mb-6">
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-europe to-brand-americas">
                        {mode === 'signin' ? 'Welcome Back' : 'Join the Ranks'}
                    </h2>
                    <p className="text-soft-gray mt-2 text-sm">
                        {mode === 'signin' ? 'Sign in to access your mission data.' : 'Create an account to track your global conquests.'}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-night/50 border border-white/5 rounded-lg mb-6">
                    <button
                        onClick={() => setMode('signin')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signin' ? 'bg-brand-europe text-white shadow-lg' : 'text-soft-gray hover:text-white'} `}
                    >
                        Sign In
                    </button>
                    <button
                        onClick={() => setMode('signup')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-brand-europe text-white shadow-lg' : 'text-soft-gray hover:text-white'} `}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 mb-6">
                    {error && <div className="p-3 bg-brand-asia/20 text-brand-asia text-xs rounded-lg border border-brand-asia/30">{error}</div>}

                    <div>
                        <label className="block text-xs font-medium text-soft-gray mb-1">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 bg-night border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-europe transition-colors"
                            placeholder="agent@geogame.com"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-soft-gray mb-1">Password</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 bg-night border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-europe transition-colors"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-brand-europe hover:bg-blue-600 text-white rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-brand-europe/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Processing...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="px-2 bg-deep text-soft-gray">Or continue with</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={async () => {
                            await signInWithGoogle();
                            onClose();
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                        Google
                    </button>

                    <button
                        onClick={async () => {
                            await signInWithFacebook();
                            onClose();
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-xl text-sm font-bold hover:bg-[#166fe5] transition-colors"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        Facebook
                    </button>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-xs text-slate-500">
                        By joining, you accept our <span className="text-blue-400 cursor-pointer hover:underline">protocols</span>.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
