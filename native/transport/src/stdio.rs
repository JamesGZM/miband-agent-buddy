use serde_json::Value;

pub fn emit(value: Value) {
    use std::io::Write;
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{}", value);
    let _ = out.flush();
}
pub fn read_commands(tx: tokio::sync::mpsc::Sender<Value>) {
    std::thread::spawn(move || {
        use std::io::BufRead;
        let input = std::io::stdin();
        let mut input = input.lock();
        loop {
            let mut bytes = Vec::new();
            let mut limited = (&mut input).take(8193);
            use std::io::Read;
            if limited.read_until(b'\n', &mut bytes).unwrap_or(0) == 0 {
                break;
            }
            if bytes.len() > 8192 {
                break;
            }
            match serde_json::from_slice(&bytes) {
                Ok(v) => {
                    if tx.blocking_send(v).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
}
