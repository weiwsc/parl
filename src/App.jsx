import { useMemo } from 'react';
import { useAppContext } from './store';
import { computeProjection } from './utils/compute';
import { Header, Tabs, Toast } from './components/Layout';
import { StrataList } from './components/Strata';
import { FactionsList } from './components/Factions';
import { ProjectionChart, ResultsGrid, SupportMatrix } from './components/Projection';
import { HistoryPanel } from './components/History';
import { TrashPanel } from './components/Trash';
import './App.css';

function App() {
  const { state, updateState, showToast } = useAppContext();
  const { tab } = state.ui;

  const projection = useMemo(() => {
    const proj = computeProjection(state);
    return {
      ...proj,
      totalSeats: state.totalSeats,
      unalignedMode: state.unalignedMode,
      strataCount: state.strata.length,
      factionsCount: state.factions.length,
      timestamp: Date.now()
    };
  }, [state]);

  const handleElection = () => {
    updateState(s => {
      s.history.unshift({
        timestamp: Date.now(),
        projection: JSON.parse(JSON.stringify(projection))
      });
      s.ui.tab = 'hist';
      return s;
    });
    showToast('Election recorded!');
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `parliament_state_${new Date().getTime()}.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        updateState(() => {
          showToast('Data imported successfully');
          return parsed; // Ensure normalize is done if needed, handled in loadFromStorage but here just pass
        });
      } catch (err) {
        showToast('Import failed: invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  return (
    <div className="app">
      <Header onElection={handleElection} onExport={handleExport} onImport={handleImport} />
      <Tabs />

      {tab === 'sim' && (
        <section className="tab-panel active">
          <div className="grid">
            <StrataList />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ProjectionChart projection={projection} />
              <ResultsGrid projection={projection} />
              <SupportMatrix projection={projection} />
            </div>
            <FactionsList />
          </div>
        </section>
      )}

      {tab === 'hist' && (
        <section className="tab-panel active">
          <HistoryPanel />
        </section>
      )}

      {tab === 'trash' && (
        <section className="tab-panel active">
          <TrashPanel />
        </section>
      )}

      <Toast />
    </div>
  );
}

export default App;
