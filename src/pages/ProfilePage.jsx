import { useState } from "react";
import { Link } from "react-router-dom";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export default function ProfilePage() {
  const [name, setName] = useState("Your Name");
  const [email, setEmail] = useState("your.email@example.com");
  const [bio, setBio] = useState(
    "I'm a software developer interested in secure communications and privacy."
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsEditing(false);
    setIsSaving(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col">
      <header className="container mx-auto p-4">
        <Link
          to="/chat"
          className="inline-flex items-center text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Chat
        </Link>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage
                      src="/placeholder.svg?height=96&width=96"
                      alt="Your Avatar"
                    />
                    <AvatarFallback className="bg-emerald-500 text-white text-2xl">
                      {name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-center sm:text-left">
                  <CardTitle className="text-2xl text-white">{name}</CardTitle>
                  <CardDescription className="text-slate-400">
                    {email}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid grid-cols-2 mx-4 bg-slate-700">
                <TabsTrigger
                  value="profile"
                  className="data-[state=active]:bg-slate-600"
                >
                  Profile
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  className="data-[state=active]:bg-slate-600"
                >
                  Security
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="p-0">
                <CardContent className="p-6">
                  {isEditing ? (
                    <form className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-200">
                          Full Name
                        </Label>
                        <Input
                          id="name"
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
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="bg-slate-900/50 border-slate-700 text-slate-200"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bio" className="text-slate-200">
                          Bio
                        </Label>
                        <textarea
                          id="bio"
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={4}
                          className="w-full rounded-md bg-slate-900/50 border border-slate-700 text-slate-200 p-2"
                        />
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-slate-400 mb-1">
                          Full Name
                        </h3>
                        <p className="text-white">{name}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-slate-400 mb-1">
                          Email
                        </h3>
                        <p className="text-white">{email}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-slate-400 mb-1">
                          Bio
                        </h3>
                        <p className="text-white">{bio}</p>
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex justify-end gap-2 p-6 pt-0">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        onClick={() => setIsEditing(false)}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={handleSave}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit Profile
                    </Button>
                  )}
                </CardFooter>
              </TabsContent>

              <TabsContent value="security" className="p-0">
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">Password</h3>
                    <Button
                      variant="outline"
                      className="border-slate-600 text-slate-200 hover:bg-slate-700"
                    >
                      Change Password
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">
                      Two-Factor Authentication
                    </h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-200">
                          Protect your account with 2FA
                        </p>
                        <p className="text-sm text-slate-400">
                          Add an extra layer of security
                        </p>
                      </div>
                      <Switch />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">
                      Session Management
                    </h3>
                    <Button
                      variant="outline"
                      className="border-slate-600 text-slate-200 hover:bg-slate-700"
                    >
                      Sign Out All Devices
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">
                      Account Deletion
                    </h3>
                    <Button
                      variant="destructive"
                      className="bg-red-900/20 hover:bg-red-900/40 text-red-400"
                    >
                      Delete Account
                    </Button>
                  </div>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
