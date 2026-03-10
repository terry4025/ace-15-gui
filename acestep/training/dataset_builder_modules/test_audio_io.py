from unittest.mock import patch, mock_open, MagicMock
from acestep.training.dataset_builder_modules.audio_io import load_lyrics_file, get_audio_duration

def test_load_lyrics_file_success():
    audio_path = "test_audio.wav"
    expected_lyrics_path = "test_audio.txt"
    lyrics_content = "test lyrics"
    with patch("os.path.exists") as mock_exists:
        mock_exists.side_effect = lambda p: p == expected_lyrics_path
        with patch("builtins.open", mock_open(read_data=lyrics_content)) as mocked_file:
            content, success = load_lyrics_file(audio_path)
            assert content == lyrics_content
            assert success is True
            mocked_file.assert_called_once_with(expected_lyrics_path, "r", encoding="utf-8")

def test_load_lyrics_file_not_found():
    audio_path = "test_audio.wav"
    with patch("os.path.exists", return_value=False):
        content, success = load_lyrics_file(audio_path)
        assert content == ""
        assert success is False

def test_load_lyrics_file_empty():
    audio_path = "test_audio.wav"
    with patch("os.path.exists", return_value=True):
        with patch("builtins.open", mock_open(read_data="")):
            content, success = load_lyrics_file(audio_path)
            assert content == ""
            assert success is False

def test_load_lyrics_file_exception():
    audio_path = "test_audio.wav"
    with patch("os.path.exists", return_value=True):
        with patch("builtins.open", side_effect=Exception("Read error")):
            content, success = load_lyrics_file(audio_path)
            assert content == ""
            assert success is False

def test_get_audio_duration_success():
    audio_path = "test_audio.wav"
    mock_info = MagicMock()
    mock_info.num_frames = 441000
    mock_info.sample_rate = 44100

    with patch("torchaudio.info", return_value=mock_info) as mock_info_call:
        duration = get_audio_duration(audio_path)
        assert duration == 10
        mock_info_call.assert_called_once_with(audio_path)

def test_get_audio_duration_exception():
    audio_path = "test_audio.wav"
    with patch("torchaudio.info", side_effect=Exception("Info error")):
        duration = get_audio_duration(audio_path)
        assert duration == 0
