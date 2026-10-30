import React from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { App } from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    primary: { main: '#195e53' },
    background: { default: '#f4f5f1', paper: '#ffffff' },
    text: { primary: '#17312f', secondary: '#647572' },
    error: { main: '#ad442e' },
  },
  typography: {
    fontFamily: '"Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: { MuiButton: { defaultProps: { disableElevation: true } } },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
