use serde_json::{Value, json};
use std::ffi::OsString;
use std::process::{Command, Stdio};

pub fn config() -> Value {
    json!({
        "application": {"name": "MiBand Agent Buddy", "id": "io.github.jamesgzm.miband-agent-buddy"},
        "cliArgs": ["--buddy-cli"],
        "guide": include_str!("../../../../services/runtime/integration-guide.md"),
    })
}

fn entrypoint(argument: &std::ffi::OsStr) -> Option<&'static str> {
    match argument.to_str()? {
        "--buddy-cli" => Some("buddy-cli.mjs"),
        _ => None,
    }
}

// Dispatch before Tauri, single-instance handling or any desktop side effects.
pub fn run_if_requested() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    let argument = args.next()?;
    let entry = match entrypoint(&argument) {
        Some(entry) => entry,
        None if argument.to_string_lossy().starts_with("--buddy-") => {
            // Retired or invalid integration modes must never start the GUI.
            println!("{{\"accepted\":false,\"code\":\"invalid_arguments\"}}");
            return Some(0);
        }
        None => return None,
    };
    let arguments: Vec<OsString> = args.collect();
    let (root, node) = crate::runtime::runtime_paths();
    let mut command = Command::new(node);
    command
        .arg(root.join("services/runtime/bin").join(entry))
        .args(arguments)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    match command.status() {
        Ok(status) => Some(status.code().unwrap_or(0)),
        Err(_) => {
            // A missing installation is observational, never a task failure.
            println!("{{\"accepted\":false,\"code\":\"unavailable\"}}");
            Some(0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explicit_integration_modes_bypass_desktop_startup() {
        assert_eq!(entrypoint("--buddy-cli".as_ref()), Some("buddy-cli.mjs"));
        assert_eq!(entrypoint("--buddy-mcp".as_ref()), None);
        assert_eq!(entrypoint("--other".as_ref()), None);
        let config = config();
        assert!(
            config["guide"]
                .as_str()
                .unwrap()
                .contains("Universal reporting logic")
        );
        assert_eq!(config["application"]["name"], "MiBand Agent Buddy");
        assert!(config.get("mcpArgs").is_none());
        assert_eq!(config["cliArgs"][0], "--buddy-cli");
        assert!(config.get("command").is_none());
        assert!(config.get("guidePath").is_none());
    }
}
