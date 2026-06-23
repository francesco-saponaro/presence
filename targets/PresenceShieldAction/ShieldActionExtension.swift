import ManagedSettings

class ShieldActionExtension: ShieldActionDelegate {

    // MARK: - Application shield

    override func handle(
        action: ShieldAction,
        for application: ApplicationToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handleAction(action: action, completionHandler: completionHandler)
    }

    // MARK: - Web domain shield

    override func handle(
        action: ShieldAction,
        for webDomain: WebDomainToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handleAction(action: action, completionHandler: completionHandler)
    }

    // MARK: - Category shield

    override func handle(
        action: ShieldAction,
        for category: ActivityCategoryToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handleAction(action: action, completionHandler: completionHandler)
    }

    // MARK: - Shared handler

    private func handleAction(
        action: ShieldAction,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        switch action {
        case .primaryButtonPressed:
            completionHandler(.close)
        case .secondaryButtonPressed:
            completionHandler(.defer)
        @unknown default:
            completionHandler(.none)
        }
    }
}