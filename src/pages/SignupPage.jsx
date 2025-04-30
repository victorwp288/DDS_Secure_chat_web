import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, ArrowLeft, Lock, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "../lib/supabaseClient";
import { ensureKeys } from "../lib/backend";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);

    try {
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: email,
          password: password,
        });

      if (signUpError) {
        if (signUpError.message.includes("User already registered")) {
          setError("This email is already registered. Please try logging in.");
        } else {
          setError(signUpError.message);
        }
        setIsLoading(false);
        return;
      }

      if (!signUpData.user) {
        throw new Error("Signup process did not return user data.");
      }

      const newUser = signUpData.user;
      console.log("Signup successful, user:", newUser);

      console.log(`Upserting profile for user ${newUser.id}...`);
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: newUser.id,
          full_name: name,
          username: email,
        },
        { onConflict: "id" }
      );

      if (profileError) {
        console.error("Error upserting profile:", profileError);
        throw new Error(
          `Failed to create/update user profile: ${profileError.message}`
        );
      }
      console.log(`Profile upserted successfully for user ${newUser.id}.`);

      try {
        await ensureKeys(newUser.id);
        console.log("✅ keys exist for", newUser.id);
      } catch (e) {
        console.error("Error ensuring keys exist:", e);
        const errorMessage =
          e && typeof e === "object" && e.message
            ? e.message
            : "An unknown error occurred during key generation.";
        setError("Could not create encryption keys: " + errorMessage);
        setIsLoading(false);
        return;
      }

      if (
        signUpData.session &&
        signUpData.session.user.email_confirmed_at === null
      ) {
        setError(
          "Account created! Please check your email to confirm your account before logging in."
        );
      } else if (signUpData.user) {
        console.log("Navigating to chat...");
        navigate("/chat");
      } else {
        setError(
          "Signup seems complete, but login state is unclear. Please try logging in or check your email."
        );
      }
    } catch (err) {
      console.error("Error during sign up process:", err);
      if (!error) {
        setError(`Signup failed: ${err.message || "Please try again."}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

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

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
            <CardHeader className="space-y-1">
              <div className="flex justify-center mb-2">
                <div className="relative">
                  <Lock className="h-8 w-8 text-emerald-400" />
                  <div className="absolute -top-1 -right-1 bg-emerald-400 rounded-full p-1">
                    <Shield className="h-3 w-3 text-slate-900" />
                  </div>
                </div>
              </div>
              <CardTitle className="text-2xl text-center text-white">
                Create an account
              </CardTitle>
              <CardDescription className="text-center text-slate-400">
                Enter your details to get started with SecureChat
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert
                  variant="destructive"
                  className="mb-4 bg-red-900/20 border-red-800 text-red-300"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-200">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-900/50 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-200">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-900/50 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-200">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-900/50 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-slate-200">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-slate-900/50 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="text-xs text-slate-400">
                  By creating an account, you agree to our{" "}
                  <Link
                    to="/terms"
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/privacy"
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Privacy Policy
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-sm text-slate-400">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
}
