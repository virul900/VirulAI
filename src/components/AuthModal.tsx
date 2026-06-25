import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  updateProfile 
} from 'firebase/auth';
import { X, Mail, Lock, User, Sparkles, Loader2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up
        if (!displayName.trim()) {
          throw new Error('Please enter a display name.');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: displayName
        });
      } else {
        // Sign In
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      let friendlyMessage = err.message;
      if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'This email address is already in use.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        friendlyMessage = 'Invalid email or password. Please try again.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMessage = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMessage = 'Please enter a valid email address.';
      }
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-55 bg-white flex flex-col items-center justify-center p-6 overflow-y-auto font-calibri"
      >
        {/* Floating Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-1 text-slate-400 hover:text-slate-600 transition-all cursor-pointer focus:outline-none z-10"
          title="Back to chat"
        >
          <X size={20} />
        </button>

        {/* Content Centered Container */}
        <div className="w-full max-w-sm flex flex-col gap-8 pt-20 pb-8 font-calibri">
          {/* Header */}
          <div className="flex flex-col gap-2 text-center select-none">
            <h2 className="text-5xl sm:text-6xl font-light text-slate-400 tracking-tight leading-tight font-calibri">
              {isSignUp ? (
                <>
                  Sign up to meet
                  <br />
                  Virul
                </>
              ) : (
                <>
                  Sign in to meet
                  <br />
                  Virul
                </>
              )}
            </h2>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-100 rounded-lg text-sm font-semibold text-red-600 leading-relaxed font-calibri text-center">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-3">
            {isSignUp && (
              <div className="flex flex-col gap-1.5 font-calibri">
                <label className="text-sm font-medium text-slate-600 font-calibri">
                  Name
                </label>
                <div className="relative font-calibri">
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-300 focus:bg-white placeholder:text-slate-400 font-calibri transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5 font-calibri">
              <label className="text-sm font-medium text-slate-600 font-calibri">
                Email Address
              </label>
              <div className="relative font-calibri">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-300 focus:bg-white placeholder:text-slate-400 font-calibri transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 font-calibri">
              <label className="text-sm font-medium text-slate-600 font-calibri">
                Password
              </label>
              <div className="relative font-calibri">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-300 focus:bg-white placeholder:text-slate-400 font-calibri transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg disabled:bg-blue-400 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 font-calibri"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{isSignUp ? "Sign Up" : "Sign In"}</span>
              )}
            </button>
          </form>

          {/* Bottom Area: Grouped with tighter spacing to pull Continue with Google and Switch link up */}
          <div className="flex flex-col gap-4 -mt-4">
            {/* Divider with no side lines */}
            <div className="text-center text-slate-400 text-sm font-semibold select-none font-calibri">
              Or
            </div>

            {/* Social Sign-In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm font-calibri flex items-center justify-center gap-3 active:scale-[0.99] transition-all cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7v2.24h2.91c1.7-1.56 2.68-3.86 2.68-6.57z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.24c-.8.54-1.84.87-3.05.87-2.34 0-4.33-1.58-5.03-3.7H.76v2.3C2.24 16.52 5.37 18 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.75c-.18-.54-.28-1.12-.28-1.75s.1-1.21.28-1.75V4.95H.76C.13 6.16 0 7.54 0 9s.13 2.84.76 4.05l3.21-2.3z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.4C13.46.99 11.42 0 9 0 5.37 0 2.24 1.48.76 4.95l3.21 2.3c.7-2.12 2.69-3.7 5.03-3.7z" />
              </svg>
              <span className="font-calibri">Continue with Google</span>
            </button>

            {/* Switch Tab */}
            <div className="text-center font-calibri">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold hover:underline outline-none focus:outline-none font-calibri"
              >
                {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
