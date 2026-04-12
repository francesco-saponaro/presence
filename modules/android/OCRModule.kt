// OCRModule.kt
// On-device text recognition using Google ML Kit.
// No image data is sent to any server.

package com.franciccio.presence

import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

class OCRModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PresenceOCR"

    @ReactMethod
    fun recognizeText(imagePath: String, promise: Promise) {
        try {
            // expo-image-picker may return a content:// or file:// URI
            val image: InputImage = if (imagePath.startsWith("content://")) {
                InputImage.fromFilePath(reactContext, Uri.parse(imagePath))
            } else {
                val cleanPath = imagePath.removePrefix("file://")
                val file = File(cleanPath)
                if (!file.exists()) {
                    promise.reject("FILE_ERROR", "Image not found: $imagePath")
                    return
                }
                InputImage.fromFilePath(reactContext, Uri.fromFile(file))
            }

            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            recognizer.process(image)
                .addOnSuccessListener { result -> promise.resolve(result.text) }
                .addOnFailureListener { e -> promise.reject("OCR_ERROR", e.message, e) }

        } catch (e: Exception) {
            promise.reject("OCR_ERROR", e.message, e)
        }
    }
}
