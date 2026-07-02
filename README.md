# Furniture Layout Planner

A web-based floor plan furniture layout tool. Upload a floor plan image, set the scale, and arrange furniture pieces to plan your room layout.

## Features

- Upload floor plan images and set scale for accurate measurements
- Add furniture pieces from a preset library or custom dimensions
- Drag and rotate furniture to arrange your layout
- Interactive grid overlay (1-ft grid when zoomed in)
- Zoom and pan controls (pinch on mobile, ctrl+wheel on desktop)
- Export your layout as PNG
- Save and load multiple plans (via browser storage)

## Development

### Setup

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Deployment

This project is configured to deploy to GitHub Pages at `username.github.io/layout` via the automated GitHub Actions workflow. Push to the `main` branch to trigger deployment.

## Usage

1. **Upload a floor plan** - Click "Upload plan" to add your floor plan image
2. **Set the scale** - Click "Set scale" and trace a known distance (like a wall or door)
3. **Add furniture** - Select furniture pieces from the library and arrange them on the plan
4. **Adjust layout** - Drag pieces to position them, use rotation controls for angle adjustments
5. **Export** - Click "Save layout PNG" to download your final layout

## Tech Stack

- React 18
- Vite
- Deployed on GitHub Pages