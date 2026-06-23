use lofty::{
    file::TaggedFileExt,
    picture::{MimeType, Picture, PictureType},
};
use std::{fs, path::Path};

pub(super) fn extract_album_artwork(
    tagged_file: &impl TaggedFileExt,
    artwork_dir: &Path,
    album_key: &str,
) -> Option<String> {
    let picture = tagged_file
        .tags()
        .iter()
        .find_map(|tag| tag.get_picture_type(PictureType::CoverFront))
        .or_else(|| {
            tagged_file
                .tags()
                .iter()
                .find_map(|tag| tag.pictures().first())
        })?;

    write_artwork_file(picture, artwork_dir, album_key).ok()
}

fn write_artwork_file(
    picture: &Picture,
    artwork_dir: &Path,
    album_key: &str,
) -> Result<String, String> {
    if picture.data().is_empty() {
        return Err("empty artwork".to_owned());
    }

    let extension = picture
        .mime_type()
        .and_then(MimeType::ext)
        .or_else(|| sniff_picture_extension(picture.data()))
        .unwrap_or("bin");
    let file_name = format!(
        "{:016x}-{:016x}.{extension}",
        stable_hash(album_key),
        stable_hash_bytes(picture.data()),
    );
    let path = artwork_dir.join(file_name);

    if !path.exists() {
        fs::write(&path, picture.data()).map_err(to_error_string)?;
    }

    Ok(path.to_string_lossy().into_owned())
}

pub(super) fn write_artwork_bytes(
    bytes: &[u8],
    artwork_dir: &Path,
    artwork_key: &str,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty artwork".to_owned());
    }

    let extension = sniff_picture_extension(bytes).unwrap_or("bin");
    let file_name = format!(
        "{:016x}-{:016x}.{extension}",
        stable_hash(artwork_key),
        stable_hash_bytes(bytes),
    );
    let path = artwork_dir.join(file_name);
    fs::write(&path, bytes).map_err(to_error_string)?;
    Ok(path.to_string_lossy().into_owned())
}

pub(super) fn make_front_cover_picture(bytes: Vec<u8>) -> Result<Picture, String> {
    let mime_type = sniff_picture_mime_type(&bytes)
        .ok_or_else(|| "library.error.unsupportedArtwork".to_owned())?;

    Ok(Picture::unchecked(bytes)
        .pic_type(PictureType::CoverFront)
        .mime_type(mime_type)
        .build())
}

fn sniff_picture_mime_type(bytes: &[u8]) -> Option<MimeType> {
    match bytes {
        [0xFF, 0xD8, ..] => Some(MimeType::Jpeg),
        [0x89, b'P', b'N', b'G', ..] => Some(MimeType::Png),
        [b'G', b'I', b'F', ..] => Some(MimeType::Gif),
        [b'B', b'M', ..] => Some(MimeType::Bmp),
        [b'I', b'I', b'*', 0x00, ..] | [b'M', b'M', 0x00, b'*', ..] => Some(MimeType::Tiff),
        _ => None,
    }
}

pub(super) fn sniff_picture_extension(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0xFF, 0xD8, ..] => Some("jpg"),
        [0x89, b'P', b'N', b'G', ..] => Some("png"),
        [b'G', b'I', b'F', ..] => Some("gif"),
        [b'B', b'M', ..] => Some("bmp"),
        [b'I', b'I', b'*', 0x00, ..] | [b'M', b'M', 0x00, b'*', ..] => Some("tif"),
        _ => None,
    }
}

pub(super) fn stable_hash(value: &str) -> u64 {
    value.bytes().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
    })
}

pub(super) fn stable_hash_bytes(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

fn to_error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}
