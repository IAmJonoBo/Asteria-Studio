//! Pipeline core stub for Asteria Studio.
//! Exposes a placeholder API surface for Electron integration via N-API (to be implemented).

pub fn process_page_stub(page_id: &str) -> String {
    format!("Processing not yet implemented for {page_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_runs() {
        assert!(process_page_stub("demo").contains("demo"));
    }
}
