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
import { signalStore } from "../lib/localDb";
import {
  initializeSignalProtocol,
  arrayBufferToBase64,
} from "../lib/signalUtils";
import { post } from "../lib/backend";

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

      console.log(`Checking for existing key bundle for user ${newUser.id}...`);
      const { data: existingKeys, error: keyCheckError } = await supabase
        .from("prekey_bundles")
        .select("user_id")
        .eq("user_id", newUser.id)
        .maybeSingle();

      if (keyCheckError) {
        console.error("Error checking for existing keys:", keyCheckError);
        throw new Error(
          `Failed to check for existing encryption keys: ${keyCheckError.message}`
        );
      }

      if (!existingKeys) {
        console.log(
          `No existing keys found. Generating Signal keys locally for user ${newUser.id}...`
        );

        // --- Generate Keys Locally using libsignal AND Store Bundle --- //
        try {
          // 1. Generate/Store keys locally
          console.log(
            `Generating Signal keys locally for user ${newUser.id}...`
          );
          const publicBundleComponents = await initializeSignalProtocol(
            signalStore
          );
          console.log(
            `Local Signal keys generated and stored via signalStore for user ${newUser.id}.`
          );

          // 2. Prepare bundle for API
          console.log(`Preparing public bundle for user ${newUser.id}...`);
          const preKeyToPublish = publicBundleComponents.preKeys[0];
          if (!preKeyToPublish) {
            throw new Error(
              "No pre-keys available in generated bundle to publish."
            );
          }
          const bundlePayload = {
            userId: newUser.id,
            registrationId: publicBundleComponents.registrationId,
            identityKey: arrayBufferToBase64(
              publicBundleComponents.identityPubKey
            ),
            signedPreKeyId: publicBundleComponents.signedPreKey.keyId,
            signedPreKeyPublicKey: arrayBufferToBase64(
              publicBundleComponents.signedPreKey.publicKey
            ),
            signedPreKeySignature: arrayBufferToBase64(
              publicBundleComponents.signedPreKey.signature
            ),
            preKeyId: preKeyToPublish.keyId,
            preKeyPublicKey: arrayBufferToBase64(preKeyToPublish.publicKey),
          };

          // 3. Store Public Bundle via API
          console.log(
            `Calling backend /api/signal/store-bundle for user ${newUser.id}...`
          );
          await post("/api/signal/store-bundle", bundlePayload);
          console.log(
            `Public bundle stored successfully via API for user ${newUser.id}.`
          );

          // 4. Navigate ONLY if all steps succeeded
          console.log("Signup and key setup complete. Navigating to chat...");
          navigate("/chat");
        } catch (processError) {
          // Catch errors from any step (local gen, bundle prep, API call)
          console.error(
            "Error during Signal key generation or bundle storage:",
            processError
          );
          setError(
            `Account created, but failed during security key setup: ${processError.message}. Please try logging in again or contact support.`
          );
          // Sign out user to prevent inconsistent state
          await supabase.auth.signOut();
          // No navigation happens here
        }
        // --- End Key Generation/Bundle Storage Logic --- //

        // Check if user needs email confirmation
        if (
          signUpData.session &&
          signUpData.session.user.email_confirmed_at === null
        ) {
          setError(
            "Account created! Please check your email to confirm your account before logging in."
          );
          // Optionally sign the user out until confirmed
          // await supabase.auth.signOut();
        } else if (signUpData.user) {
          // User might be auto-confirmed or already confirmed
          console.log("Navigating to chat...");
          navigate("/chat");
        } else {
          // Should not happen if signup succeeded, but handle defensively
          setError(
            "Signup seems complete, but login state is unclear. Please try logging in or check your email."
          );
        }
      } else {
        // This block handles the case where keys *already* exist
        console.log(
          `Encryption keys already exist for user ${newUser.id}. Skipping generation.`
        );
        // If keys exist, the user should be okay to proceed
        console.log("Existing keys found. Navigating to chat...");
        navigate("/chat");
      }
    } catch (err) {
      // This outer catch handles errors from Supabase signup or profile upsert primarily
      console.error("Error during sign up process (before key gen):", err);
      if (!error) {
        // Avoid overwriting specific errors like 'email exists'
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
