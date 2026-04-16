import Foundation
import Vision
import UIKit

@objc(PresenceOCR)
public class PresenceOCR: NSObject {
    
    @objc
    public func scanImage(_ imagePath: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let image = UIImage(contentsOfFile: imagePath),
              let cgImage = image.cgImage else {
            reject("IMAGE_ERROR", "Could not load image at path", nil)
            return
        }
        
        let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNRecognizeTextRequest { (request, error) in
            if let error = error {
                reject("OCR_ERROR", error.localizedDescription, error)
                return
            }
            
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                resolve("")
                return
            }
            
            let recognizedText = observations.compactMap { observation in
                return observation.topCandidates(1).first?.string
            }.joined(separator: "\n")
            
            resolve(recognizedText)
        }
        
        request.recognitionLevel = .accurate
        
        do {
            try requestHandler.perform([request])
        } catch {
            reject("SCAN_ERROR", "Failed to perform OCR", error)
        }
    }
}