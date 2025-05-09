import { Link } from "react-router-dom";
import React from 'react';
import { AlertCircle, ArrowLeft, Lock, Shield } from "lucide-react";


const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col">
    <header className="container mx-auto p-4">
      <Link
        to="/"
        className="inline-flex items-center text-slate-300 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Home
      </Link>
    </header>

      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col py-10">
      <div className="max-w-4xl mx-auto bg-gradient-to-b p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center text-white mb-6">About the project</h1>
        <p className="text-white mb-8">
          Welcome to our About page! Here you can learn more about our company, our mission, and our team.
          Welcome to our About page! Here you can learn more about our project.
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Our Mission</h2>
          <h2 className="text-2xl font-semibold text-white mb-4">Our project</h2>
          <p className="text-white">
            Our mission is to provide high-quality services and products to our customers. We strive to exceed expectations and deliver exceptional value.
            The project is based on end to end message encryption. It is a web application that allows users to send and receive encrypted messages securely.
            The application uses the double ratchet algorithm to ensure that messages are encrypted and decrypted securely. 
          </p>
        </section>
        

       <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Meet the Team</h2>
          <h2 className="text-2xl font-semibold text-white mb-4">The group:</h2>
          <div className="space-y-4">

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Abul Kasem Mohammed Omar Sharif</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Mads Holt Jensen</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-gray-800">John Doe</h3>
              <p className="text-gray-600">CEO & Founder</p>
              <h3 className="text-xl font-semibold text-white">Neha Sharma</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-gray-800">Jane Smith</h3>
              <p className="text-gray-600">CTO</p>
              <h3 className="text-xl font-semibold text-white">Ivan Mezinov</h3>
              </div>

              <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Victor Wejergang Petersen</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-gray-800">Emily Johnson</h3>
              <p className="text-gray-600">Marketing Director</p>
              <h3 className="text-xl font-semibold text-white">Morten Allan Jensen</h3>
            </div>


          </div>
        </section>

        @todo: Add more sections as needed
        @todo add back button 
        @todo Write about the project and members
        </div>
        </div>
      </div>

  );
};

export default About;
