import { supabase } from "./supabaseClient";
import { u8ToB64, b64ToU8 } from "./signalUtils";

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Encrypts file content using AES-GCM with a random key
 * Returns the encrypted data and the encryption key
 */
async function encryptFileContent(fileBuffer) {
  // Generate a random 256-bit key for AES-GCM
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );

  // Generate a random 96-bit IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the file content
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    fileBuffer
  );

  // Export the key to raw format
  const exportedKey = await crypto.subtle.exportKey("raw", key);

  return {
    encryptedData: new Uint8Array(encryptedData),
    key: new Uint8Array(exportedKey),
    iv: iv,
  };
}

/**
 * Decrypts file content using AES-GCM
 */
async function decryptFileContent(encryptedData, keyBytes, ivBytes) {
  // Import the key
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "AES-GCM",
      length: 256,
    },
    false, // not extractable
    ["decrypt"]
  );

  // Decrypt the data
  const decryptedData = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes,
    },
    key,
    encryptedData
  );

  return decryptedData;
}

/**
 * Uploads an encrypted file to Supabase Storage
 * Returns file metadata including encryption key and IV
 */
export async function uploadEncryptedFile(file, conversationId, senderId) {
  if (!file) {
    throw new Error("No file provided");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    );
  }

  try {
    // Verify authentication before upload
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError) {
      console.error("Auth error:", authError);
      throw new Error(`Authentication error: ${authError.message}`);
    }

    if (!session) {
      throw new Error("User not authenticated");
    }

    console.log("Auth check passed, user ID:", session.user.id);

    // Verify senderId matches authenticated user
    if (session.user.id !== senderId) {
      throw new Error("Sender ID does not match authenticated user");
    }

    // Read file content
    const fileBuffer = await file.arrayBuffer();

    // Debug: Log original file details
    console.log("=== ORIGINAL FILE ===");
    console.log("File name:", file.name);
    console.log("File type (claimed):", file.type);
    console.log("File size:", file.size);

    // Detect actual file type based on content
    const detectedType = detectFileType(fileBuffer);
    console.log(
      "File type (detected):",
      detectedType.type,
      "-",
      detectedType.description
    );

    if (file.type !== detectedType.type) {
      console.warn("⚠️  FILE TYPE MISMATCH:");
      console.warn("   Claimed:", file.type);
      console.warn("   Detected:", detectedType.type);
      console.warn("   This may cause issues when opening the file");
    }

    const originalHash = await calculateFileHash(fileBuffer);
    console.log("Original hash:", originalHash);
    logFileDetails("Original File Buffer", fileBuffer);

    // Encrypt the file content
    const { encryptedData, key, iv } = await encryptFileContent(fileBuffer);

    // Debug: Log encryption details
    console.log("=== ENCRYPTION ===");
    console.log("Original size:", fileBuffer.byteLength);
    console.log("Encrypted size:", encryptedData.byteLength);
    console.log("Key length:", key.length);
    console.log("IV length:", iv.length);
    logFileDetails("Encrypted Data", encryptedData.buffer);

    // Test immediate decryption to verify encryption worked
    console.log("=== TESTING IMMEDIATE DECRYPTION ===");
    try {
      const testDecrypted = await decryptFileContent(encryptedData, key, iv);
      const testHash = await calculateFileHash(testDecrypted);
      console.log("Test decryption size:", testDecrypted.byteLength);
      console.log("Test decryption hash:", testHash);
      console.log("Hash match:", originalHash === testHash);
      logFileDetails("Test Decrypted", testDecrypted, {
        expectedSize: fileBuffer.byteLength,
        hash: originalHash,
      });

      if (originalHash !== testHash) {
        throw new Error(
          "CRITICAL: Encryption/decryption test failed - hashes do not match!"
        );
      }
    } catch (testError) {
      console.error("CRITICAL: Immediate decryption test failed:", testError);
      throw new Error(`Encryption verification failed: ${testError.message}`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const encryptedFileName = `${conversationId}/${senderId}/${timestamp}_${randomSuffix}.encrypted`;

    console.log("Uploading to path:", encryptedFileName);

    // Create a blob from encrypted data
    const encryptedBlob = new Blob([encryptedData], {
      type: "application/octet-stream",
    });

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("secure-files")
      .upload(encryptedFileName, encryptedBlob, {
        cacheControl: "3600",
        upsert: false,
        metadata: {
          originalName: file.name,
          originalSize: file.size.toString(),
          mimeType: file.type,
          uploadedBy: senderId,
          conversationId: conversationId,
        },
      });

    if (uploadError) {
      console.error("File upload error:", uploadError);
      throw new Error(`File upload failed: ${uploadError.message}`);
    }

    console.log("File uploaded successfully:", uploadData);

    // Return file metadata with encryption info
    return {
      id: uploadData.id,
      path: uploadData.path,
      fullPath: uploadData.fullPath,
      originalName: file.name,
      originalSize: file.size,
      mimeType: file.type,
      encryptionKey: u8ToB64(key), // Base64 encoded key
      iv: u8ToB64(iv), // Base64 encoded IV
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error uploading encrypted file:", error);
    throw error;
  }
}

/**
 * Downloads and decrypts a file from Supabase Storage
 */
export async function downloadAndDecryptFile(
  filePath,
  encryptionKey,
  iv,
  originalName,
  mimeType = "application/octet-stream"
) {
  try {
    console.log("Downloading file:", { filePath, originalName, mimeType });

    // Download the encrypted file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("secure-files")
      .download(filePath);

    if (downloadError) {
      throw new Error(`File download failed: ${downloadError.message}`);
    }

    console.log("Downloaded encrypted file, size:", fileData.size);

    // Convert blob to array buffer
    const encryptedBuffer = await fileData.arrayBuffer();
    console.log("Encrypted buffer size:", encryptedBuffer.byteLength);

    // Decode the encryption key and IV
    const keyBytes = b64ToU8(encryptionKey);
    const ivBytes = b64ToU8(iv);

    console.log(
      "Decryption keys ready, key length:",
      keyBytes.length,
      "IV length:",
      ivBytes.length
    );

    // Decrypt the file content
    const decryptedBuffer = await decryptFileContent(
      encryptedBuffer,
      keyBytes,
      ivBytes
    );

    console.log("Decrypted buffer size:", decryptedBuffer.byteLength);

    // Debug: Calculate hash and verify integrity
    const decryptedHash = await calculateFileHash(decryptedBuffer);
    console.log("Decrypted hash:", decryptedHash);
    logFileDetails("Final Decrypted Buffer", decryptedBuffer);

    // Detect the actual file type from the decrypted content
    const actualFileType = detectFileType(decryptedBuffer);
    console.log(
      "Actual file type detected:",
      actualFileType.type,
      "-",
      actualFileType.description
    );

    if (mimeType !== actualFileType.type) {
      console.warn("⚠️  MIME TYPE MISMATCH:");
      console.warn("   Stored MIME type:", mimeType);
      console.warn("   Actual content type:", actualFileType.type);
      console.warn("   Using detected type for blob creation");
    }

    // Validate decryption success by checking if we got data
    if (decryptedBuffer.byteLength === 0) {
      throw new Error(
        "Decryption resulted in empty file - possible key/IV mismatch"
      );
    }

    // Use the detected type instead of stored type for validation and blob creation
    const finalMimeType = actualFileType.type;

    // For PDFs, check for PDF signature (only if we expect it to be a PDF)
    if (mimeType === "application/pdf" || finalMimeType === "application/pdf") {
      const pdfSignature = new Uint8Array(decryptedBuffer.slice(0, 4));
      const pdfMagic = String.fromCharCode(...pdfSignature);
      console.log("PDF signature check:", pdfMagic);
      console.log(
        "PDF header bytes:",
        Array.from(pdfSignature)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")
      );
      if (!pdfMagic.startsWith("%PDF")) {
        if (mimeType === "application/pdf") {
          console.warn(
            "Warning: File claimed to be PDF but signature not found"
          );
          console.warn("Expected: %PDF, Got:", pdfMagic);
          console.warn("This is likely a text file with .pdf extension");
        }
      } else {
        console.log("✅ PDF signature is valid");
      }
    }

    // Create a blob from decrypted data WITH the detected MIME type
    const decryptedBlob = new Blob([decryptedBuffer], {
      type: finalMimeType || "application/octet-stream",
    });

    console.log(
      "Created blob with type:",
      decryptedBlob.type,
      "size:",
      decryptedBlob.size
    );

    // Create download URL
    const downloadUrl = URL.createObjectURL(decryptedBlob);

    return {
      url: downloadUrl,
      blob: decryptedBlob,
      buffer: decryptedBuffer,
      originalName: originalName,
    };
  } catch (error) {
    console.error("Error downloading and decrypting file:", error);
    throw error;
  }
}

/**
 * Deletes a file from Supabase Storage
 */
export async function deleteEncryptedFile(filePath) {
  try {
    const { error } = await supabase.storage
      .from("secure-files")
      .remove([filePath]);

    if (error) {
      throw new Error(`File deletion failed: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
}

/**
 * Gets file metadata without downloading the actual content
 */
export async function getFileMetadata(filePath) {
  try {
    const { data, error } = await supabase.storage
      .from("secure-files")
      .list(filePath.split("/").slice(0, -1).join("/"), {
        search: filePath.split("/").pop(),
      });

    if (error) {
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }

    return data?.[0] || null;
  } catch (error) {
    console.error("Error getting file metadata:", error);
    throw error;
  }
}

// Helper function to calculate SHA-256 hash of a buffer for integrity checking
async function calculateFileHash(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Helper function to log file details
function logFileDetails(label, buffer, additionalInfo = {}) {
  console.log(`=== ${label} ===`);
  console.log("Buffer size:", buffer.byteLength);
  console.log("Buffer type:", buffer.constructor.name);
  console.log(
    "First 32 bytes:",
    Array.from(new Uint8Array(buffer.slice(0, 32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
  );
  if (additionalInfo.expectedSize) {
    console.log("Expected size:", additionalInfo.expectedSize);
    console.log(
      "Size match:",
      buffer.byteLength === additionalInfo.expectedSize
    );
  }
  if (additionalInfo.hash) {
    console.log("Expected hash:", additionalInfo.hash);
  }
  console.log("=================");
}

/**
 * Test function for debugging encryption/decryption
 * Call this from browser console: window.testFileEncryption()
 */
export async function testFileEncryption() {
  console.log("🧪 Testing file encryption/decryption...");

  try {
    // Create a simple test file
    const testContent =
      "Hello, this is a test file content! 🎉\nThis should remain intact after encryption/decryption.";
    const testBuffer = new TextEncoder().encode(testContent);

    console.log("Original content:", testContent);
    console.log("Original buffer size:", testBuffer.byteLength);

    // Test encryption
    const { encryptedData, key, iv } = await encryptFileContent(
      testBuffer.buffer
    );
    console.log("Encrypted size:", encryptedData.byteLength);
    console.log("Key length:", key.length);
    console.log("IV length:", iv.length);

    // Test decryption
    const decryptedBuffer = await decryptFileContent(encryptedData, key, iv);
    const decryptedContent = new TextDecoder().decode(decryptedBuffer);

    console.log("Decrypted content:", decryptedContent);
    console.log("Content match:", testContent === decryptedContent);

    if (testContent === decryptedContent) {
      console.log("✅ Encryption/decryption test PASSED");
      return true;
    } else {
      console.error("❌ Encryption/decryption test FAILED");
      return false;
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    return false;
  }
}

// Make it available globally for testing
if (typeof window !== "undefined") {
  window.testFileEncryption = testFileEncryption;
}

// Helper function to detect actual file type based on magic bytes
function detectFileType(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Check for common file signatures
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return { type: "application/pdf", description: "PDF document" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "image/jpeg", description: "JPEG image" };
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { type: "image/png", description: "PNG image" };
  }
  if (
    hex.startsWith("504b0304") ||
    hex.startsWith("504b0506") ||
    hex.startsWith("504b0708")
  ) {
    return { type: "application/zip", description: "ZIP archive" };
  }

  // Check if it's plain text
  let isText = true;
  for (let i = 0; i < Math.min(bytes.length, 512); i++) {
    const byte = bytes[i];
    // Allow printable ASCII, newlines, tabs, and carriage returns
    if (
      !(byte >= 32 && byte <= 126) &&
      byte !== 10 &&
      byte !== 13 &&
      byte !== 9
    ) {
      isText = false;
      break;
    }
  }

  if (isText) {
    return { type: "text/plain", description: "Text document" };
  }

  return { type: "application/octet-stream", description: "Binary file" };
}
