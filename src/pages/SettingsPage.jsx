import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Bell,
  Globe,
  Lock,
  Moon,
  Shield,
  Sun,
  Volume2,
} from "lucide-react";
// eslint-disable-next-line
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [language, setLanguage] = useState("english");
  const [volume, setVolume] = useState([70]);

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
          <h1 className="text-3xl font-bold text-white mb-6">Settings</h1>

          <div className="space-y-6">
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Sun className="h-5 w-5 text-emerald-400" />
                  Appearance
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Customize how SecureChat looks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-slate-200">Dark Mode</Label>
                    <p className="text-sm text-slate-400">
                      Toggle between light and dark themes
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Sun className="h-4 w-4 text-slate-400" />
                    <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                    <Moon className="h-4 w-4 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="spanish">Spanish</SelectItem>
                      <SelectItem value="french">French</SelectItem>
                      <SelectItem value="german">German</SelectItem>
                      <SelectItem value="japanese">Japanese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Bell className="h-5 w-5 text-emerald-400" />
                  Notifications
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Manage how you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-slate-200">Push Notifications</Label>
                    <p className="text-sm text-slate-400">
                      Receive notifications when you're not active
                    </p>
                  </div>
                  <Switch
                    checked={notifications}
                    onCheckedChange={setNotifications}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-slate-200">Sound Effects</Label>
                    <p className="text-sm text-slate-400">
                      Play sounds for new messages and calls
                    </p>
                  </div>
                  <Switch checked={sounds} onCheckedChange={setSounds} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-200">
                      Notification Volume
                    </Label>
                    <span className="text-sm text-slate-400">{volume[0]}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-slate-400" />
                    <Slider
                      value={volume}
                      onValueChange={setVolume}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-400" />
                  Privacy & Security
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Manage your privacy and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-slate-200">Read Receipts</Label>
                    <p className="text-sm text-slate-400">
                      Let others know when you've read their messages
                    </p>
                  </div>
                  <Switch
                    checked={readReceipts}
                    onCheckedChange={setReadReceipts}
                  />
                </div>

                <div className="space-y-0.5">
                  <Label className="text-slate-200">Encryption Key</Label>
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-900/50 border border-slate-700 rounded-md p-2 text-slate-400 text-sm font-mono flex-1 truncate">
                      a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-600 text-slate-200 hover:bg-slate-700"
                    >
                      Rotate
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Your encryption key is stored locally and never sent to our
                    servers
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-slate-600 text-slate-200 hover:bg-slate-700"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Advanced Security Settings
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Globe className="h-5 w-5 text-emerald-400" />
                  About
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Information about SecureChat
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-1">
                    Version
                  </h3>
                  <p className="text-white">1.0.0</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-1">
                    Terms of Service
                  </h3>
                  <Link
                    to="/terms"
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Read our Terms of Service
                  </Link>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-slate-400 mb-1">
                    Privacy Policy
                  </h3>
                  <Link
                    to="/privacy"
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Read our Privacy Policy
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
