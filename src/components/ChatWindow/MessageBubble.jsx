import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Download,
  FileText,
  Image,
  Video,
  Music,
  Archive,
} from "lucide-react";
import { downloadAndDecryptFile } from "../../lib/fileUpload";
import { useState } from "react";

export function MessageBubble({ message, profile }) {
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Try to parse message content to extract file info
  const parseMessageContent = (content) => {
    try {
      const parsed = JSON.parse(content);
      if (
        parsed &&
        typeof parsed === "object" &&
        ("text" in parsed || "file" in parsed)
      ) {
        console.log("Successfully parsed message content:", parsed);
        return parsed;
      }
    } catch {
      // Not JSON, treat as plain text
      console.log(
        "Message content is not JSON, treating as plain text:",
        content
      );
    }
    return { text: content, file: null };
  };

  const { text, file } = parseMessageContent(message.content);

  const handleFileDownload = async () => {
    if (!file || downloadingFile) return;

    setDownloadingFile(true);
    try {
      console.log("Starting file download:", file);

      const decryptedFile = await downloadAndDecryptFile(
        file.path,
        file.encryptionKey,
        file.iv,
        file.originalName,
        file.mimeType // Pass the original MIME type
      );

      console.log("File decrypted successfully:", decryptedFile);

      // Create a temporary link and trigger download
      const link = document.createElement("a");
      link.href = decryptedFile.url;
      link.download = file.originalName;

      // Set the MIME type on the link for better browser handling
      if (file.mimeType) {
        link.type = file.mimeType;
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log("Download triggered for:", file.originalName);

      // Clean up the object URL
      setTimeout(() => {
        URL.revokeObjectURL(decryptedFile.url);
      }, 1000);
    } catch (error) {
      console.error("File download failed:", error);
      alert("Failed to download file: " + error.message);
    } finally {
      setDownloadingFile(false);
    }
  };

  const getFileIcon = (mimeType) => {
    if (!mimeType) return <FileText className="h-5 w-5" />;

    if (mimeType.startsWith("image/")) return <Image className="h-5 w-5" />;
    if (mimeType.startsWith("video/")) return <Video className="h-5 w-5" />;
    if (mimeType.startsWith("audio/")) return <Music className="h-5 w-5" />;
    if (mimeType.includes("pdf")) return <FileText className="h-5 w-5" />;
    if (mimeType.includes("zip") || mimeType.includes("archive"))
      return <Archive className="h-5 w-5" />;

    return <FileText className="h-5 w-5" />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const renderContent = () => {
    // Handle file attachment
    if (file) {
      return (
        <div className="space-y-2">
          {/* Text content if present */}
          {text && text.trim() && (
            <div className="whitespace-pre-wrap break-words">{text}</div>
          )}

          {/* File attachment */}
          <div
            className={`
              border rounded-lg p-3 cursor-pointer transition-colors max-w-sm
              ${
                message.isSelf
                  ? "border-blue-300/50 bg-blue-50/10 hover:bg-blue-50/20 text-white"
                  : "border-slate-600 bg-slate-600/50 hover:bg-slate-600/70 text-slate-100"
              }
              ${downloadingFile ? "opacity-50 cursor-not-allowed" : ""}
            `}
            onClick={handleFileDownload}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`
                p-2 rounded-lg flex-shrink-0
                ${message.isSelf ? "bg-blue-400/20" : "bg-slate-500/50"}
              `}
              >
                {getFileIcon(file.mimeType)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {file.originalName}
                </div>
                <div
                  className={`text-xs flex items-center space-x-2 ${
                    message.isSelf ? "text-blue-100" : "text-slate-300"
                  }`}
                >
                  <span>{formatFileSize(file.originalSize)}</span>
                  {downloadingFile && <span>• Downloading...</span>}
                </div>
              </div>

              <div
                className={`
                p-1 rounded-full flex-shrink-0
                ${message.isSelf ? "bg-blue-400/20" : "bg-slate-500/50"}
                ${downloadingFile ? "" : "hover:bg-slate-400/50"}
              `}
              >
                {downloadingFile ? (
                  <div
                    className={`h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${
                      message.isSelf ? "border-white" : "border-slate-300"
                    }`}
                  />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Handle legacy file format (fallback)
    if (text && text.startsWith("[File](")) {
      const match = text.match(/\[File\]\((.*?)\)\s*(.*)/);
      const url = match?.[1];
      const name = match?.[2] || "Download File";
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-400"
        >
          📎 {name}
        </a>
      );
    } else if (text && text.startsWith("[File] ")) {
      return <span className="text-slate-300">📎 {text.slice(7)}</span>;
    }

    // Regular text message
    return (
      <div className="whitespace-pre-wrap break-words">
        {text || message.content}
      </div>
    );
  };

  const renderStatusIcon = () => {
    if (!message.isSelf) return null;

    switch (message.status) {
      case "sending":
      case "encrypting":
      case "uploading":
        return <Clock className="h-3 w-3 text-gray-400" />;
      case "sent":
        return <Check className="h-3 w-3 text-gray-400" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case "failed":
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      default:
        return <Check className="h-3 w-3 text-gray-400" />;
    }
  };

  return (
    <div
      className={`flex gap-3 p-3 ${
        message.isSelf ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={message.senderAvatar} />
        <AvatarFallback>
          {message.isSelf && profile
            ? (profile.full_name || profile.username || "Me")[0].toUpperCase()
            : message.senderName
            ? message.senderName[0].toUpperCase()
            : "?"}
        </AvatarFallback>
      </Avatar>

      <div
        className={`flex flex-col max-w-xs lg:max-w-md xl:max-w-lg ${
          message.isSelf ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`rounded-lg px-3 py-2 shadow-sm ${
            message.isSelf
              ? "bg-blue-500 text-white"
              : "bg-slate-700 text-slate-100"
          } ${message.isOptimistic ? "opacity-70" : ""}`}
        >
          {renderContent()}
        </div>

        <div
          className={`flex items-center gap-1 mt-1 text-xs text-slate-400 ${
            message.isSelf ? "flex-row-reverse" : "flex-row"
          }`}
        >
          <span>{message.timestamp}</span>
          {renderStatusIcon()}
          {message.isOptimistic && (
            <span className="text-yellow-400">Sending...</span>
          )}
        </div>
      </div>
    </div>
  );
}
