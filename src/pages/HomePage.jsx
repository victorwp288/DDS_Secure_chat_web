import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, MessageSquare, Shield, Zap } from "lucide-react";
import { Link } from "react-router-dom";
//eslint-disable-next-line
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export default function HomePage() {
  //Phrases to be displayed on right side of page
  const phrases = [
    "In a world of leaks and hacks, your conversations deserve absolute confidentiality.",
    "Share moments, ideas, and secrets — with complete peace of mind.",
    "No ads. No trackers. Just secure communication.",
    "Your messages are for you — and only you.",
    "Privacy isn't a feature. It's our foundation.",
  ];

  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [randomPosition, setRandomPosition] = useState({
    top: "50%",
    left: "50%",
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPhrase((prev) => (prev + 1) % phrases.length);

      const top = Math.floor(Math.random() * 30) + 30; // between 30% and 70%
      const left = Math.floor(Math.random() * 5) + 50; // between 60% and 75%
      setRandomPosition({ top: `${top}%`, left: `${left}%` });
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="container mx-auto p-4 flex justify-between items-center"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-8 w-8 text-emerald-500" />
          <span className="font-bold text-white text-2xl">SecureChat</span>
        </div>
      </motion.header>

      {/* Main Section */}
      <main className="flex-1 container mx-auto px-4 py-12 flex flex-col md:flex-row items-center justify-center text-center gap-8">
        {/* Left Side Content */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="hidden 2xl:flex flex-1"
        >
          <div className="flex flex-col">
            <img
              src="/images/green_text.png"
              alt="Chat bubble green"
              className="w-60 ml-0"
            />
            <img
              src="/images/blue_text.png"
              alt="Chat bubble blue"
              className="w-60 ml-30"
            />
          </div>
        </motion.div>

        {/* Center Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="flex-1 max-w-md"
        >
          <div className="mb-6 flex justify-center">
            <div className="relative drop-shadow-lg">
              <Lock className="h-20 w-20 text-emerald-500" />
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="absolute -top-1 -right-1 bg-blue-400 rounded-full p-1 shadow-md"
              >
                <Shield className="h-6 w-6 text-slate-900" />
              </motion.div>
            </div>
          </div>

          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-wide"
          >
            Secure. Private. Encrypted.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-slate-300 mb-8"
          >
            End-to-end encrypted messaging that keeps your conversations private
            and secure.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="grid gap-4 mb-8"
          >
            <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg text-left border border-slate-700">
              <Shield className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm flex-1">
                End-to-end encryption for all messages
              </span>
            </div>

            <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg text-left border border-slate-700">
              <Zap className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm flex-1">
                Fast, reliable messaging on any device
              </span>
            </div>

            <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg text-left border border-slate-700">
              <MessageSquare className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm flex-1">
                Group chats with the same level of security
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-5"
          >
            <Link to="/login" className="w-full">
              <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                Login
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-22 mt-4"
          >
            <Link
              to="/signup"
              className="text-slate-200 text-sm hover:text-emerald-400 transition-colors"
            >
              Don't have an account?
            </Link>
            <span className="text-slate-200 text-sm">Want to learn more?</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 mt-1"
          >
            <Link to="/signup" className="w-full">
              <Button className="w-full bg-blue-400 hover:bg-blue-600 text-white">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/about" className="w-full">
              <Button
                variant="outline"
                className="w-full border-slate-700 text-slate-600 hover:bg-slate-700"
              >
                Learn More
              </Button>
            </Link>
          </motion.div>

          {/* Developer/Test Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mt-6 pt-4 border-t border-slate-700"
          >
            <Link to="/crypto-test" className="w-full">
              <Button
                variant="outline"
                className="w-full border-emerald-600 text-emerald-400 hover:bg-emerald-900/20 text-sm"
              >
                🔒 Security Validation Test Page
              </Button>
            </Link>
            <p className="text-xs text-slate-400 mt-1">
              Test Forward Secrecy & Post-Compromise Security
            </p>
          </motion.div>
        </motion.div>

        {/* Right Side */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="hidden 2xl:flex flex-1 relative overflow-hidden min-h-[500px]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPhrase}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              style={{
                position: "absolute",
                top: randomPosition.top,
                left: randomPosition.left,
                transform: "translate(-50%, -50%)",
                maxWidth: "250px",
              }}
              className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-slate-200 text-center italic text-xl leading-relaxed"
            >
              "{phrases[currentPhrase]}"
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.0 }}
        className="container mx-auto p-4 text-center text-slate-400 text-sm"
      >
        <p>© {new Date().getFullYear()} SecureChat. All rights reserved.</p>
      </motion.footer>
    </div>
  );
}
