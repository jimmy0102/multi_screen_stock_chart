import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Note } from '../types';

interface NoteDrawerProps {
  isOpen: boolean;
  ticker: string;
  onClose: () => void;
}

const NoteDrawer: React.FC<NoteDrawerProps> = ({ isOpen, ticker, onClose }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ノートの読み込み
  useEffect(() => {
    if (!isOpen || !ticker) return;

    const loadNotes = async () => {
      setIsLoading(true);
      try {
        const tickerNotes = await window.electronAPI.getNotes(ticker);
        setNotes(tickerNotes);
      } catch (error) {
        console.error('Failed to load notes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, [isOpen, ticker]);

  // ドロワーが開いたときにテキストエリアにフォーカス
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSaveNote = useCallback(async () => {
    if (!newNoteText.trim() || !ticker) return;

    try {
      const savedNote = await window.electronAPI.insertNote(ticker, newNoteText.trim());
      setNotes(prev => [savedNote, ...prev]);
      setNewNoteText('');
    } catch (error) {
      console.error('Failed to save note:', error);
    }
  }, [newNoteText, ticker]);

  // Ctrl+Enter でメモを保存
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'Enter' && isOpen) {
        event.preventDefault();
        handleSaveNote();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSaveNote]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`note-drawer ${isOpen ? 'open' : ''}`}>
      <div className="note-drawer-header">
        <div className="note-drawer-title">
          メモ - {ticker}
        </div>
        <button className="note-drawer-close" onClick={onClose}>
          ×
        </button>
      </div>
      
      <div className="note-drawer-content">
        <div className="note-input-section">
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="メモを入力してください... (Ctrl+Enter で保存)"
          />
          <button
            className="note-save-button"
            onClick={handleSaveNote}
            disabled={!newNoteText.trim()}
          >
            保存 (Ctrl+Enter)
          </button>
        </div>

        {isLoading ? (
          <div className="chart-loading" style={{ marginTop: '16px' }}>
            メモを読み込み中...
          </div>
        ) : (
          <div className="notes-list">
            {notes.length === 0 ? (
              <div style={{ color: '#888888', textAlign: 'center', marginTop: '16px' }}>
                まだメモがありません
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="note-item">
                  <div className="note-date">
                    {formatDate(note.created_at)}
                  </div>
                  <div className="note-text">
                    {note.text}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteDrawer;