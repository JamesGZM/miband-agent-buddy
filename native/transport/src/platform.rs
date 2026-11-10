use crate::{
    error::classify_error,
    session::run,
    stdio::{emit, read_commands},
};
use serde_json::json;

pub fn run_main_loop() {
    let (tx, rx) = tokio::sync::mpsc::channel(8);
    read_commands(tx);
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().expect("runtime");
        let result = runtime.block_on(run(rx));
        if let Err(error) = &result {
            emit(
                json!({"event":"error","code":classify_error(error),"message":"連線操作失敗，請檢查裝置距離、認證與其他連線程式"}),
            );
        }
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    });
    objc2_core_foundation::CFRunLoop::run();
}
