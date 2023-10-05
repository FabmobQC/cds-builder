# CurbLR to CDS converter
Tool to convert CurbLR data to [CDS](https://github.com/openmobilityfoundation/curb-data-specification).

Note this tool currently only generates CDS zones, without their policies.

## Setup
1. Install dependencies
``` sh
npm instal
```
2. Create a `config.json` file and set the field `curblr_path` to the path to the CurbLR file. See [config.example.json](./config-example.json) for an example. If you don't have a CurbLR file, you can download one [here](https://github.com/FabmobQC/curb-map/blob/dev-plaza/src/assets/data/mtl-subset-segment-plaza.curblr.json).

## Launch
``` sh
npm start
```

A file named `zones-dump.geojson` will be created. It can be used to visualize the data of the zones. Note this is not a "CDS file", since such a thing is not defined.
