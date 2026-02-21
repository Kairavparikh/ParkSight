# ParkSight: Satellite-Based Parking Detection for Atlanta

![ParkSight Banner](https://img.shields.io/badge/ParkSight-Hackathon-blue)
![Python](https://img.shields.io/badge/Python-3.10+-green)
![PyTorch](https://img.shields.io/badge/PyTorch-2.1+-orange)

ParkSight is an AI-powered system that detects and counts parking lots across Atlanta using NAIP satellite imagery and deep learning. Built for a 36-hour hackathon.

## Features

- **Deep Learning Segmentation**: DeepLabV3+ with ResNet34 backbone trained on ParkSeg12k dataset
- **Satellite Imagery**: NAIP (National Agriculture Imagery Program) 4-channel imagery (RGB + NIR)
- **Interactive Map**: Dark-themed web interface with Leaflet.js
- **Real-time Filtering**: Filter by lot size, confidence, and search
- **Comprehensive Stats**: Total lots, estimated spots, coverage area, average size

## Quick Start

### Prerequisites

- Python 3.10+
- CUDA-capable GPU (for training)
- Google Earth Engine account

### Installation

```bash
# Clone repository
cd ParkSight

# Install dependencies
pip install -r requirements.txt

# Authenticate with Google Earth Engine
earthengine authenticate
```

### Pipeline Execution

```bash
# 1. Train model on ParkSeg12k dataset (~8-12 hours on GPU)
python scripts/01_train_model.py

# 2. Download NAIP tiles for Atlanta (~1-2 hours)
python scripts/02_download_naip.py

# 3. Run inference on Atlanta tiles (~15-30 minutes)
python scripts/03_run_inference.py

# 4. Generate GeoJSON from predictions (~5 minutes)
python scripts/04_generate_geojson.py

# 5. Launch web interface
cd frontend
python -m http.server 8000
# Open http://localhost:8000 in browser
```

## Project Structure

```
ParkSight/
├── config/
│   ├── config.yaml              # Hyperparameters and paths
│   └── atlanta_roi.geojson      # Atlanta region of interest
├── data/
│   ├── naip_tiles/              # Downloaded NAIP imagery
│   ├── processed/               # Preprocessed tiles
│   └── metadata.csv             # Tile coordinates
├── models/
│   ├── checkpoints/             # Training checkpoints
│   └── final_model.pth          # Best trained model
├── outputs/
│   ├── predictions/             # Prediction masks
│   └── parking_lots.geojson     # Final GeoJSON output
├── src/
│   ├── data/
│   │   ├── parkseg_dataset.py   # ParkSeg12k dataset loader
│   │   └── naip_downloader.py   # Google Earth Engine downloader
│   ├── model/
│   │   ├── segmentation.py      # DeepLabV3+ model
│   │   └── train.py             # Training loop
│   ├── inference/
│   │   ├── predictor.py         # Batch prediction
│   │   └── postprocess.py       # Mask cleaning
│   └── spatial/
│       └── vectorize.py         # Mask → GeoJSON conversion
├── scripts/
│   ├── 01_train_model.py        # Training script
│   ├── 02_download_naip.py      # Data download script
│   ├── 03_run_inference.py      # Inference script
│   └── 04_generate_geojson.py   # GeoJSON generation
└── frontend/
    ├── index.html               # Web interface
    ├── styles.css               # Dark theme styling
    └── app.js                   # Map logic and filters
```

## Dataset

**ParkSeg12k** (UTEL-UIUC/parkseg12k on Hugging Face)
- 12,617 image-mask pairs
- 512×512 resolution
- 4-channel (RGB + NIR) or 3-channel (RGB)
- Binary segmentation (parking lot vs. background)

**NAIP Imagery**
- Collection: `USDA/NAIP/DOQQ`
- Resolution: 1 meter/pixel
- Bands: Red, Green, Blue, Near-Infrared (NIR)
- Coverage: Atlanta metro area (scoped to Midtown/Buckhead/Airport)

## Model Architecture

```
DeepLabV3+
├── Encoder: ResNet34 (ImageNet pretrained)
├── Decoder: Atrous Spatial Pyramid Pooling (ASPP)
├── Input: (B, 4, 512, 512) - 4-channel NAIP imagery
├── Output: (B, 1, 512, 512) - Binary parking lot mask
└── Loss: Dice Loss + Binary Cross-Entropy
```

## Configuration

Edit `config/config.yaml` to customize:

```yaml
# Training
training:
  batch_size: 16
  epochs: 30
  learning_rate: 0.0003

# Model
model:
  architecture: "DeepLabV3Plus"
  encoder: "resnet34"
  in_channels: 4  # RGB + NIR

# Inference
inference:
  threshold: 0.5  # Prediction confidence threshold

# Postprocessing
postprocessing:
  min_area_pixels: 20  # Minimum parking lot size
  fill_holes_pixels: 10
```

## Web Interface

The interactive map includes:

### Sidebar Features
- **Aggregate Stats**: Total lots, estimated spots, coverage area, average lot size
- **Confidence Meter**: Average model confidence across all detections
- **Filters**:
  - Lot Size: Small (<50 spots), Medium (50-200), Large (>200)
  - Minimum Confidence: Slider from 0-100%
  - Search: Filter by lot ID or size category
- **Legend**: Color-coded by lot size

### Map Features
- **Dark Theme**: CARTO Dark Matter basemap
- **Color-Coded Polygons**: Blue (small), Orange (medium), Red (large)
- **Interactive Popups**: Click any parking lot for details
- **Hover Effects**: Visual feedback on mouseover
- **Zoom Controls**: Bottom-right corner

## Performance

### Model Metrics (ParkSeg12k Test Set)
- **Target mIoU**: > 0.75
- **Training Time**: 8-12 hours (NVIDIA RTX 3090)
- **Inference Speed**: ~5 minutes per 200 tiles (GPU)

### Coverage
- **Region**: Midtown, Buckhead, Airport corridor (~50 km²)
- **Tiles**: ~200 (512m × 512m each)
- **Expected Detections**: 10-50 parking lots (depends on area density)

## Troubleshooting

### GEE Authentication Issues
```bash
earthengine authenticate
# Follow the browser prompts
```

### GPU Out of Memory
Reduce batch size in `config/config.yaml`:
```yaml
training:
  batch_size: 8  # or 4
```

### Missing GeoJSON
Ensure all pipeline steps completed successfully:
```bash
ls outputs/parking_lots.geojson
```

If missing, re-run:
```bash
python scripts/04_generate_geojson.py
```

### Frontend Not Loading Data
Check that GeoJSON exists and frontend is served from correct directory:
```bash
cd frontend
python -m http.server 8000
```

## Limitations

- **Cloud Cover**: NAIP tiles with >5% cloud cover are filtered out
- **Resolution**: 1m/pixel may miss very small parking areas
- **False Positives**: Roads, rooftops occasionally misclassified (tune postprocessing thresholds)
- **Tile Boundaries**: Parking lots split across tile edges may be fragmented

## Future Improvements

1. **Multi-temporal Analysis**: Track parking lot changes over time
2. **Occupancy Detection**: Estimate real-time parking availability
3. **3D Building Footprints**: Filter rooftop false positives
4. **Street Parking**: Detect on-street parking spots
5. **Mobile App**: iOS/Android interface

## Credits

- **Dataset**: ParkSeg12k by UTEL-UIUC (University of Illinois Urbana-Champaign)
- **Imagery**: NAIP (USDA Farm Service Agency)
- **Basemap**: CARTO Dark Matter
- **Framework**: PyTorch, segmentation-models-pytorch, Leaflet.js

## License

MIT License - See LICENSE file for details

## Contact

For questions or issues, please open a GitHub issue.

---

Built with ❤️ for Hackalytics 2024
