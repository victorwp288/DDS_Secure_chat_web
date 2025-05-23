import { Link } from "react-router-dom";
import React from "react";
import {
  ArrowLeft,
  Lock,
  Shield,
  Users,
  Target,
  MessageCircle,
} from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Header */}
      <header className="container mx-auto p-4">
        <Link
          to="/"
          className="inline-flex items-center text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-3 mb-6">
              <Lock className="h-12 w-12 text-emerald-500" />
              <h1 className="text-4xl md:text-5xl font-bold text-white">
                About SecureChat
              </h1>
            </div>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
              A cutting-edge end-to-end encrypted messaging platform built with
              modern web technologies and the Signal Protocol, ensuring your
              conversations remain private and secure.
            </p>
          </div>

          {/* Project Mission */}
          <section className="bg-slate-800/50 rounded-lg p-8 border border-slate-700">
            <div className="flex items-center space-x-3 mb-6">
              <Target className="h-8 w-8 text-emerald-400" />
              <h2 className="text-3xl font-bold text-white">Our Mission</h2>
            </div>
            <p className="text-slate-300 text-lg leading-relaxed">
              To provide a secure, privacy-focused communication platform that
              empowers users to communicate freely without fear of surveillance
              or data breaches. We believe privacy is a fundamental right, not a
              luxury.
            </p>
          </section>

          {/* Technical Features */}
          <section className="bg-slate-800/50 rounded-lg p-8 border border-slate-700">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="h-8 w-8 text-emerald-400" />
              <h2 className="text-3xl font-bold text-white">
                Technical Excellence
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <MessageCircle className="h-6 w-6 text-emerald-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Double Ratchet Algorithm
                    </h3>
                    <p className="text-slate-300">
                      Implements the Signal Protocol's double ratchet for
                      forward secrecy and post-compromise security.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Lock className="h-6 w-6 text-emerald-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      End-to-End Encryption
                    </h3>
                    <p className="text-slate-300">
                      Every message is encrypted locally before transmission,
                      ensuring only intended recipients can read your
                      communications.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Shield className="h-6 w-6 text-emerald-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Modern Web Technologies
                    </h3>
                    <p className="text-slate-300">
                      Built with React, Vite, and Supabase for a fast,
                      responsive, and scalable user experience.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Users className="h-6 w-6 text-emerald-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Group Messaging
                    </h3>
                    <p className="text-slate-300">
                      Secure group conversations with the same level of
                      encryption and privacy as one-on-one chats.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Team Section */}
          <section className="bg-slate-800/50 rounded-lg p-8 border border-slate-700">
            <div className="flex items-center space-x-3 mb-8">
              <Users className="h-8 w-8 text-emerald-400" />
              <h2 className="text-3xl font-bold text-white">
                Development Team
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Abul Kasem Mohammed Omar Sharif
                </h3>
                <p className="text-emerald-400 text-sm font-medium">
                  Developer
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Mads Holt Jensen
                </h3>
                <p className="text-emerald-400 text-sm font-medium">
                  Developer
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Neha Sharma
                </h3>
                <p className="text-emerald-400 text-sm font-medium">
                  Developer
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Ivan Mezinov
                </h3>
                <p className="text-emerald-400 text-sm font-medium">
                  Developer
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Victor Wejergang Petersen
                </h3>
                <p className="text-emerald-400 text-sm font-medium">
                  Developer
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Morten Allan Jensen
                </h3>
                <p className="text-emerald-400 text-sm font-medium">
                  Developer
                </p>
              </div>
            </div>
          </section>

          {/* Security Note */}
          <section className="bg-emerald-900/20 rounded-lg p-8 border border-emerald-700/50">
            <div className="flex items-start space-x-4">
              <Shield className="h-8 w-8 text-emerald-400 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Security First
                </h2>
                <p className="text-slate-300 leading-relaxed">
                  This application demonstrates industry-standard cryptographic
                  practices including forward secrecy and post-compromise
                  security. Every message benefits from the same security
                  guarantees used by leading secure messaging applications
                  worldwide.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto p-4 text-center text-slate-400 text-sm mt-12">
        <p>
          © {new Date().getFullYear()} SecureChat Development Team. Built with
          privacy in mind.
        </p>
      </footer>
    </div>
  );
};

export default About;
