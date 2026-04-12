// PresenceOCR.swift
// On-device text recognition using Apple Vision (VNRecognizeTextRequest).
// No image data ever leaves the device.
//
// Do NOT add `import React` — RCTPromiseResolveBlock / RCTPromiseRejectBlock
// are bridged to Swift via the project's ObjC bridging header automatically.

import Foundation
import UIKit
import Vision

@objc(PresenceOCR)
class PresenceOCR: NSObject {

  @objc
  func recognizeText(
    _ imagePath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Normalise path — expo-image-picker can return a file:// URI.
    let cleanPath = imagePath.hasPrefix("file://")
      ? String(imagePath.dropFirst(7))
      : imagePath

    guard
      let image = UIImage(contentsOfFile: cleanPath),
      let cgImage = image.cgImage
    else {
      reject("IMAGE_ERROR", "Could not load image at path: \(imagePath)", nil)
      return
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    let request = VNRecognizeTextRequest { request, error in
      if let error = error {
        reject("OCR_ERROR", error.localizedDescription, error)
        return
      }

      let observations = request.results as? [VNRecognizedTextObservation] ?? []
      let text = observations
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")

      resolve(text)
    }

    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    // Cover all five supported locales
    request.recognitionLanguages = ["en-US", "es-ES", "fr-FR", "it-IT", "pt-BR"]

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        reject("OCR_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
