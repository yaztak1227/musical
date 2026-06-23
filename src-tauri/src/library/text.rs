use encoding_rs::{SHIFT_JIS, UTF_8, WINDOWS_1252};

pub(super) fn repair_mojibake(text: &str) -> String {
    let mut best = text.trim().to_owned();
    let mut best_score = text_quality_score(text.trim());

    for bytes in mojibake_byte_sources(text) {
        let (decoded_utf8, _, had_utf8_errors) = UTF_8.decode(&bytes);
        if !had_utf8_errors {
            let candidate = decoded_utf8.trim();
            let candidate_score = text_quality_score(candidate);
            if candidate_score > best_score + 3 {
                return candidate.to_owned();
            }
        }

        for encoding in [SHIFT_JIS] {
            let (decoded, _, had_errors) = encoding.decode(&bytes);
            if had_errors {
                continue;
            }
            let candidate = decoded.trim();
            let candidate_score = text_quality_score(candidate);
            if candidate_score > best_score + 3 {
                best = candidate.to_owned();
                best_score = candidate_score;
            }
        }
    }

    best
}

fn mojibake_byte_sources(text: &str) -> Vec<Vec<u8>> {
    let mut sources = Vec::new();
    if let Some(bytes) = encode_as_mixed_single_byte_text(text) {
        sources.push(bytes);
    }
    if let Some(bytes) = encode_as_windows_1252_bytes(text) {
        sources.push(bytes);
    }
    if let Some(bytes) = encode_as_latin1_bytes(text) {
        sources.push(bytes);
    }
    sources
}

fn encode_as_windows_1252_bytes(text: &str) -> Option<Vec<u8>> {
    let (bytes, _, had_errors) = WINDOWS_1252.encode(text);
    (!had_errors).then(|| bytes.into_owned())
}

fn encode_as_latin1_bytes(text: &str) -> Option<Vec<u8>> {
    text.chars()
        .map(|character| u8::try_from(character as u32).ok())
        .collect()
}

fn encode_as_mixed_single_byte_text(text: &str) -> Option<Vec<u8>> {
    text.chars()
        .map(|character| {
            let mut buffer = [0u8; 4];
            let encoded = character.encode_utf8(&mut buffer);
            let (bytes, _, had_errors) = WINDOWS_1252.encode(encoded);
            if !had_errors && bytes.len() == 1 {
                return Some(bytes[0]);
            }
            u8::try_from(character as u32).ok()
        })
        .collect()
}

fn text_quality_score(text: &str) -> i32 {
    let mut score = 0;
    for character in text.chars() {
        if character == '\u{fffd}' || character.is_control() {
            score -= 12;
        } else if is_japanese_character(character) {
            score += 4;
        } else if character.is_ascii_alphanumeric() {
            score += 1;
        }
    }

    if contains_mojibake_marker(text) {
        score -= 8;
    }

    score
}

fn contains_mojibake_marker(text: &str) -> bool {
    ["Ã", "Â", "ã", "ä", "å", "æ", "œ", "€", "�"]
        .iter()
        .any(|marker| text.contains(marker))
}

fn is_japanese_character(character: char) -> bool {
    matches!(
        character as u32,
        0x3040..=0x30ff | 0x3400..=0x9fff | 0xf900..=0xfaff | 0xff66..=0xff9f
    )
}
