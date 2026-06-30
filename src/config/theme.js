// Theme configuration for LevelBuilder
export const theme = {
  // Color palette
  colors: {
    // Primary colors
    primary: '#4CAF50',
    primaryHover: '#45a049',
    primaryLight: '#E8F5E8',
    
    // Success colors
    success: '#4CAF50',
    successHover: '#45a049',
    
    // Warning colors
    warning: '#FF9800',
    warningHover: '#F57C00',
    
    // Background colors
    background: '#f5f5f5',
    surface: '#ffffff',
    
    // Text colors
    textPrimary: '#333333',
    textSecondary: '#555555',
    textMuted: '#666666',
    
    // Border colors
    border: '#ddd',
    borderLight: '#eee',
    borderDark: '#ccc',
    
    // Disabled colors
    disabled: '#ccc',
    disabledBackground: '#f5f5f5',
    
    // Hex map specific colors
    hexStroke: '#333',
    hexStrokeWidth: 1,
    hexInnerStroke: '#ffffff',
    hexInnerStrokeHover: '#ffffff99',
    hexInnerStrokeWidth: 2,
    hexInnerStrokeWidthSelected: 3,
    hexCoordinates: '#0000009f',
    
    // Scrollbar colors
    scrollbarTrack: '#f1f1f1',
    scrollbarThumb: '#c1c1c1',
    scrollbarThumbHover: '#a8a8a8'
  },
  
  // Layout dimensions
  layout: {
    headerHeight: '60px',
    panelPadding: '20px',
    panelGap: '20px',
    borderRadius: '8px',
    borderWidth: '1px',
    
    // Panel widths
    parametersPanelWidth: '350px',
    infoPanelWidth: '300px',
    
    // Input dimensions
    inputPadding: '8px 12px',
    buttonPadding: '12px',
    
    // Terrain grid
    terrainGridColumns: 2,
    terrainColorSize: '20px',
    legendColorSize: '16px',
    
    // Switch dimensions
    switchWidth: '50px',
    switchHeight: '24px',
    switchThumbSize: '20px',
    
    // Zoom controls
    zoomButtonSize: '32px',
    zoomLevelMinWidth: '50px'
  },
  
  // Typography
  typography: {
    fontSize: {
      small: '10px',
      normal: '13px',
      medium: '14px',
      large: '16px',
      xlarge: '18px'
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      bold: 700
    },
    lineHeight: {
      normal: 1.4,
      tight: 1.2
    }
  },
  
  // Shadows
  shadows: {
    panel: '0 2px 10px rgba(0,0,0,0.1)',
    switch: '0 2px 4px rgba(0,0,0,0.2)'
  },
  
  // Transitions
  transitions: {
    fast: '0.2s',
    medium: '0.3s',
    easing: 'ease'
  },
  
  // Hex map configuration
  hexMap: {
    baseHexSize: 30,
    minZoom: 0.2,
    maxZoom: 3.0,
    zoomStep: 0.1,
    hexStrokeOffset: 3
  },
  
  // Map parameters defaults
  mapDefaults: {
    width: 5,
    height: 8,
    zoom: 1.5
  }
}

// Export individual sections for easier imports
export const { colors, layout, typography, shadows, transitions, hexMap, mapDefaults } = theme
