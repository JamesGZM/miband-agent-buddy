// Only fixed diagnostic codes cross IPC; upstream errors may contain device identifiers.
pub fn classify_error(error: &anyhow::Error) -> &'static str {
    let text = format!("{error:#}");
    if text.contains("Device rejected authentication") {
        "auth_rejected"
    } else if text.contains("install result") {
        "install_receipt_missing"
    } else if text.contains("third-party app install failed") {
        "install_rejected"
    } else if text.contains("prepare") {
        "install_prepare"
    } else if text.contains("MASS") {
        "transfer"
    } else if text.contains("App not installed") {
        "app_missing"
    } else if text.contains("timed out") || text.contains("deadline") {
        "timeout"
    } else {
        "operation_failed"
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_authentication_rejection_is_terminal() {
        let error = anyhow::anyhow!("Device rejected authentication: account error 4")
            .context("Core authentication failed");
        assert_eq!(classify_error(&error), "auth_rejected");
        assert_eq!(
            classify_error(&anyhow::anyhow!("deadline has elapsed")),
            "timeout"
        );
    }
    #[test]
    fn installation_result_timeout_is_not_a_generic_timeout() {
        assert_eq!(
            classify_error(&anyhow::anyhow!("timed out waiting for install result")),
            "install_receipt_missing"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!(
                "third-party app install failed: VerifyFailed"
            )),
            "install_rejected"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!(
                "timed out waiting for install prepare response"
            )),
            "install_prepare"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!("failed to send MASS payload")),
            "transfer"
        );
    }
}
