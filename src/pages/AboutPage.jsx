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
          Welcome to our About page! Here you can learn more about our project.
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Our project</h2>
          <p className="text-white">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer ut posuere orci. Vestibulum bibendum dolor tortor, eu pharetra eros pharetra ac. Vestibulum semper justo felis, sit amet aliquet magna aliquam at. Ut sollicitudin risus vitae maximus tristique. Fusce a malesuada mauris. Suspendisse tempor cursus ligula, a viverra nulla rutrum quis. Fusce hendrerit metus nunc, vel mattis libero sodales id. Nunc commodo volutpat est, nec fermentum felis dictum non. Praesent varius gravida ante non consectetur. Curabitur sit amet consectetur lorem. Nam pharetra urna in urna dignissim, ut lobortis ex ullamcorper. Fusce elementum sollicitudin tortor gravida rutrum. Nam tellus ipsum, posuere in placerat in, cursus nec augue.

Vivamus eget dui at lacus egestas posuere. Donec mattis faucibus congue. Suspendisse laoreet pretium massa a placerat. Quisque tincidunt felis eu lacus viverra, eu molestie libero lacinia. Aliquam viverra mauris cursus massa lobortis, sagittis varius mauris porttitor. Nunc lobortis lobortis lorem id dignissim. Aenean nec odio sed mi viverra auctor. Suspendisse pellentesque pellentesque massa nec porttitor. Integer dapibus velit at velit consectetur vehicula. 
          </p>
        </section>
        

       <section className="mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">The group:</h2>
          <div className="space-y-4">

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Abul Kasem Mohammed Omar Sharif</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Mads Holt Jensen</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Neha Sharma</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Ivan Mezinov</h3>
              </div>

              <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Victor Wejergang Petersen</h3>
            </div>

            <div className="team-member">
              <h3 className="text-xl font-semibold text-white">Morten Allan Jensen</h3>
            </div>


          </div>
        </section>

        </div>
        </div>
      </div>

  );
};

export default About;
