import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, MessageSquare, Shield, Zap } from "lucide-react";
import { Link } from "react-router-dom";
//eslint-disable-next-line
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <header className="container mx-auto p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Lock className="h-6 w-6 text-emerald-400" />
          <span className="font-bold text-white text-xl">SecureChat</span>
        </div>
        <Link to="/login">
          <Button variant="ghost" className="text-white hover:text-emerald-400">
            Login
          </Button>
        </Link>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <Lock className="h-16 w-16 text-emerald-400" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="absolute -top-1 -right-1 bg-emerald-400 rounded-full p-1"
              >
                <Shield className="h-4 w-4 text-slate-900" />
              </motion.div>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Secure. Private. Encrypted.
          </h1>

          <p className="text-slate-300 mb-8">
            End-to-end encrypted messaging that keeps your conversations private
            and secure.
          </p>

          <div className="grid gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg text-left"
            >
              <Shield className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm">
                End-to-end encryption for all messages
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg text-left"
            >
              <Zap className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm">
                Fast, reliable messaging on any device
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg text-left"
            >
              <MessageSquare className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm">
                Group chats with the same level of security
              </span>
            </motion.div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/signup" className="w-full">
              <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/about" className="w-full">
              <Button
                variant="outline"
                className="w-full border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                Learn More
              </Button>
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="container mx-auto p-4 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} SecureChat. All rights reserved.</p>
      </footer>
    </div>
  );
}
