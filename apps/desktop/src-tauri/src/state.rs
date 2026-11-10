use crate::{
    domain::{Credentials, Preferences},
    protocol::RuntimeState,
    runtime::RuntimeClient,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

pub struct Session {
    pub credentials: Option<Credentials>,
    pub busy: bool,
    pub login_error: Option<String>,
    pub prefs: Preferences,
    pub runtime: RuntimeState,
    pub worker: RuntimeClient,
    pub config: PathBuf,
}
pub type Shared = Arc<Mutex<Session>>;
