// Only fixed diagnostic codes cross IPC; upstream errors may contain device identifiers.
pub fn classify_error(error: &anyhow::Error) -> &'static str {
    let text = format!("{error:#}");
    if text.contains("channel lagged") {
        "event_lagged"
    } else if text.contains("channel closed") {
        "event_closed"
    } else if text.contains("Device rejected authentication") {
        "auth_rejected"
    } else if text.contains("install result") {
        "install_receipt_missing"
    } else if text.contains("third-party app install failed") {
        "install_rejected"
    } else if text.contains("prepare") {
        "install_prepare"
    } else if text.contains("Timeout waiting for mass packet ACK") {
        "transfer_ack_timeout"
    } else if text.contains("SAR session was reset while waiting for MASS ACK")
        || text.contains("SAR session was reset during MASS transfer")
        || text.contains("device restarted the L1 session; pending transfer dropped")
        || text.contains("SAR retransmission limit exceeded:")
    {
        "transfer_session_reset"
    } else if text.contains("RFCOMM async send did not complete within") {
        "transfer_send_timeout"
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
    fn event_receiver_failures_have_distinct_fixed_codes() {
        assert_eq!(
            classify_error(&anyhow::anyhow!("channel lagged by 12")),
            "event_lagged"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!("channel closed")),
            "event_closed"
        );
    }
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

    #[test]
    fn mass_ack_timeout_is_not_hidden_by_its_outer_context() {
        let error = anyhow::anyhow!("deadline has elapsed")
            .context("Timeout waiting for mass packet ACK")
            .context("failed to send MASS payload");
        assert_eq!(classify_error(&error), "transfer_ack_timeout");
    }

    #[test]
    fn mass_session_resets_use_a_fixed_code_without_sequence_or_device_details() {
        for cause in [
            "SAR session was reset while waiting for MASS ACK (seq 23)",
            "SAR session was reset during MASS transfer (part 1025)",
            "device restarted the L1 session; pending transfer dropped",
            "SAR retransmission limit exceeded: device stopped acknowledging (timed out)",
            "SAR retransmission limit exceeded: device keeps rejecting packets (timed out)",
        ] {
            let error = anyhow::anyhow!(cause)
                .context("failed to send MASS payload")
                .context("synthetic fixture-device operation");
            assert_eq!(classify_error(&error), "transfer_session_reset");
        }
    }

    #[test]
    fn native_write_timeout_is_distinct_when_the_source_chain_preserves_it() {
        let error = anyhow::anyhow!(
            "RFCOMM async send did not complete within 45s: timed out waiting on channel"
        )
        .context("failed to send MASS payload");
        assert_eq!(classify_error(&error), "transfer_send_timeout");
    }

    #[test]
    fn unknown_mass_failures_do_not_invent_a_timeout_or_user_cancellation() {
        let error = anyhow::anyhow!("SPP send failed").context("failed to send MASS payload");
        assert_eq!(classify_error(&error), "transfer");
    }
}
