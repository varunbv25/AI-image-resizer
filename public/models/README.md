# NAFNet ONNX Model Directory

Place the `nafnet.onnx` model file in this directory to enable ML-powered image enhancement.

## How to get the NAFNet ONNX model:

### Option 1: Download Pre-converted Model
Look for pre-converted NAFNet ONNX models from:
- ONNX Model Zoo: https://github.com/onnx/models
- NAFNet official repository: https://github.com/megvii-research/NAFNet

### Option 2: Convert from PyTorch
Follow the instructions in `/ONNX_SETUP.md` to convert the NAFNet PyTorch model to ONNX format.

## Required file:
- `nafnet.onnx` - The NAFNet model in ONNX format

## Expected Model Specifications:
- **Input**: Float32 tensor [1, 3, H, W] (batch, channels, height, width)
- **Output**: Float32 tensor [1, 3, H, W]
- **Input range**: [0, 1] normalized RGB values
- **Output range**: [0, 1] normalized RGB values
- **Recommended size**: 5-15 MB (compressed model preferred)

Once the model file is placed here, the application will automatically detect and use it for the "ML Model" enhancement option.
