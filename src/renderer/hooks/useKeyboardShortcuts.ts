import { useEffect } from 'react';
import { KeyboardShortcuts } from '../types';

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcuts) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, shiftKey, ctrlKey, altKey, metaKey } = event;
      
      // Ctrl+Enter は除外（メモ保存用）
      if (ctrlKey && key === 'Enter') {
        return;
      }
      
      // テキストエリアやインプットにフォーカスがある場合はショートカットを無効にする
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      )) {
        // Escapeキーは例外として許可
        if (key !== 'Escape') {
          return;
        }
      }
      
      // ショートカットキーの組み合わせを作成
      const shortcutKey = [
        shiftKey && 'Shift',
        ctrlKey && 'Ctrl',
        altKey && 'Alt',
        metaKey && 'Meta',
        key
      ].filter(Boolean).join('+');
      
      // ショートカットが存在する場合は実行
      const handler = shortcuts[shortcutKey as keyof KeyboardShortcuts];
      if (handler) {
        event.preventDefault();
        event.stopPropagation();
        handler();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
};