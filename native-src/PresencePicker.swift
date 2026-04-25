import SwiftUI
import FamilyControls
import UIKit
import React // Required for RCTPromiseResolveBlock / RCTPromiseRejectBlock

// ── SwiftUI picker sheet ───────────────────────────────────────────────────

@available(iOS 16.0, *)
private final class PickerViewModel: ObservableObject {
    @Published var selection = FamilyActivitySelection()
    var onDone: ((FamilyActivitySelection) -> Void)?
    var onCancel: (() -> Void)?
}

@available(iOS 16.0, *)
private struct AppPickerSheet: View {
    @ObservedObject var viewModel: PickerViewModel

    var body: some View {
        NavigationStack {
            FamilyActivityPicker(selection: $viewModel.selection)
                .navigationTitle("Select Apps to Block")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { viewModel.onCancel?() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { viewModel.onDone?(viewModel.selection) }
                    }
                }
        }
    }
}

// ── Native module ──────────────────────────────────────────────────────────

@objc(PresencePicker)
public class PresencePicker: NSObject {

    /// Present the FamilyActivityPicker sheet.
    ///
    /// - Parameter initialBase64: Base64-encoded FamilyActivitySelection from a
    ///   previous call — pre-populates the picker so users can edit their selection.
    ///   Pass nil / empty string on first launch.
    ///
    /// Resolves with:
    ///   - nil if the user tapped Cancel
    ///   - { selection: String, apps: [{ bundleId: String, name?: String }] } on Done
    @objc
    public func show(_ initialBase64: String?,
                     resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.0, *) else {
            reject("UNSUPPORTED", "FamilyActivityPicker requires iOS 16 or later", nil as Error?)
            return
        }

        DispatchQueue.main.async {
            let viewModel = PickerViewModel()

            // Pre-populate the picker if a prior selection was provided
            if let base64 = initialBase64, !base64.isEmpty,
               let data = Data(base64Encoded: base64),
               let prior = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
                viewModel.selection = prior
            }

            let hostingController = UIHostingController(rootView: AppPickerSheet(viewModel: viewModel))

            guard let rootVC = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })?.rootViewController else {
                reject("NO_VC", "Could not find root view controller", nil as Error?)
                return
            }

            // Traverse to the topmost presented VC — presenting on a VC that already
            // has a presentedViewController silently fails in UIKit.
            var topVC = rootVC
            while let presented = topVC.presentedViewController {
                topVC = presented
            }

            viewModel.onCancel = { [weak hostingController] in
                hostingController?.dismiss(animated: true) {
                    resolve(nil)
                }
            }

            viewModel.onDone = { [weak hostingController] selection in
                hostingController?.dismiss(animated: true) {
                    // Encode the selection for storage / later use in applyShieldFromSelection
                    guard let data = try? JSONEncoder().encode(selection) else {
                        reject("ENCODE_ERROR", "Failed to encode FamilyActivitySelection", nil as Error?)
                        return
                    }
                    let base64 = data.base64EncodedString()

                    // Return bundle IDs + display names so JS can show what was selected
                    let apps: [[String: String]] = selection.applications.compactMap { app in
                        guard let bundleId = app.bundleIdentifier else { return nil }
                        var entry: [String: String] = ["bundleId": bundleId]
                        if let name = app.localizedDisplayName { entry["name"] = name }
                        return entry
                    }

                    NSLog("[PresencePicker] Done: %d apps selected", apps.count)
                    resolve(["selection": base64, "apps": apps])
                }
            }

            topVC.present(hostingController, animated: true)
        }
    }
}
