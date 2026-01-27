import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  // Search and filters
  searchQuery: string;
  selectedSeverities: string[];
  selectedTypes: string[];
  selectedLanguages: string[];
  analysisStatus: 'all' | 'analyzed' | 'not_analyzed' | 'has_issues' | 'no_issues';
  lastScanFilter: 'all' | 'today' | 'week' | 'month' | 'older';
  
  // Pagination
  currentPage: number;
  
  // Modals
  showHistoryModal: boolean;
  selectedRepo: { id: string; name: string } | null;
  showFilters: boolean;
  
  // Theme and preferences
  theme: 'light' | 'dark' | 'system';
  role: 'owner' | 'developer';
  
  // Loading states for repositories being analyzed
  analyzingRepos: Set<string>;
  
  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedSeverities: (severities: string[]) => void;
  setSelectedTypes: (types: string[]) => void;
  setSelectedLanguages: (languages: string[]) => void;
  setAnalysisStatus: (status: UIState['analysisStatus']) => void;
  setLastScanFilter: (filter: UIState['lastScanFilter']) => void;
  setShowFilters: (show: boolean) => void;
  setCurrentPage: (page: number) => void;
  setShowHistoryModal: (show: boolean) => void;
  setSelectedRepo: (repo: { id: string; name: string } | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setRole: (role: 'owner' | 'developer') => void;
  setAnalyzingRepo: (repoId: string, analyzing: boolean) => void;
  
  // Utility actions
  clearFilters: () => void;
  reset: () => void;
}

const initialState = {
  searchQuery: '',
  selectedSeverities: [],
  selectedTypes: [],
  selectedLanguages: [],
  analysisStatus: 'all' as const,
  lastScanFilter: 'all' as const,
  currentPage: 1,
  showHistoryModal: false,
  selectedRepo: null,
  showFilters: false,
  theme: 'system' as const,
  role: 'owner' as const,
  analyzingRepos: new Set<string>()
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      ...initialState,

      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedSeverities: (severities) => set({ selectedSeverities: severities }),
      setSelectedTypes: (types) => set({ selectedTypes: types }),
      setSelectedLanguages: (languages) => set({ selectedLanguages: languages }),
      setAnalysisStatus: (status) => set({ analysisStatus: status }),
      setLastScanFilter: (filter) => set({ lastScanFilter: filter }),
      setShowFilters: (show) => set({ showFilters: show }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setShowHistoryModal: (show) => set({ showHistoryModal: show }),
      setSelectedRepo: (repo) => set({ selectedRepo: repo }),
      setTheme: (theme) => set({ theme }),
      setRole: (role) => set({ role }),
      setAnalyzingRepo: (repoId, analyzing) => set((state) => {
        const newSet = new Set(state.analyzingRepos);
        if (analyzing) {
          newSet.add(repoId);
        } else {
          newSet.delete(repoId);
        }
        return { analyzingRepos: newSet };
      }),

      clearFilters: () => set({
        searchQuery: '',
        selectedSeverities: [],
        selectedTypes: [],
        selectedLanguages: [],
        analysisStatus: 'all',
        lastScanFilter: 'all'
      }),

      reset: () => set(initialState)
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({
        theme: state.theme,
        role: state.role
      })
    }
  )
);
