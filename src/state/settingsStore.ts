import { create } from 'zustand';

interface SettingsState {
    h3DebugMode: boolean;
    setH3DebugMode: (enabled: boolean) => void;
    toggleH3DebugMode: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    h3DebugMode: false,
    setH3DebugMode: (enabled) => set({ h3DebugMode: enabled }),
    toggleH3DebugMode: () => set((state) => ({ h3DebugMode: !state.h3DebugMode })),
}));
