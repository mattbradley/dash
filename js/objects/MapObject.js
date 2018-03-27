// geolocation = [33.523900, -111.908756];
export default class MapObject extends THREE.Object3D {
  constructor(geolocation = null) {
    super();

    this.geolocation = geolocation;
    this.tilesGroup = null;

    const tileSize = geolocation ? this.tileSizeInMeters() : 10;
    const grid = new THREE.GridHelper(MapObject.HALF_NUM_TILES * 8 * tileSize, MapObject.HALF_NUM_TILES * 8, 0x333333, 0x333333);
    grid.renderOrder = -1;
    grid.material.depthTest = false;
    grid.position.add(new THREE.Vector3(-tileSize / 2, 0, -tileSize / 2));
    this.add(grid);

    if (geolocation)
      this.drawTiles();
  }

  // Converts lat-long geolocation to Google Maps world coodinates
  static geoToWorld(latlng) {
    const latitudeRadians = latlng[0] * Math.PI / 180;
    const x = (latlng[1] + 180) / 360 * 256;
    const y = ((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * 256;
    return [x, y];
  }

  // Calculates the x and y tile indices for the provided world coordinates
  static worldToTile(worldCoordinates) {
    return [Math.floor(worldCoordinates[0] * MapObject.SCALE / 256), Math.floor(worldCoordinates[1] * MapObject.SCALE / 256)];
  }

  drawTiles() {
    if (this.tileGroup != null) this.remove(this.tilesGroup);
    this.tileGroup = new THREE.Group();

    const originTile = MapObject.worldToTile(MapObject.geoToWorld(this.geolocation));
    const tileSize = this.tileSizeInMeters();

    for (let x = -MapObject.HALF_NUM_TILES, h = 0; x < MapObject.HALF_NUM_TILES; x++) {
      for (let y = -MapObject.HALF_NUM_TILES; y < MapObject.HALF_NUM_TILES; y++, h++) {
        const tileTexture = new THREE.TextureLoader().load(`https://khms${h % 4}.google.com/kh/v=748?x=${originTile[0] + x}&y=${originTile[1] + y}&z=${MapObject.ZOOM}`);
        tileTexture.anisotropy = 16;
        const tileGeometry = new THREE.PlaneBufferGeometry(tileSize, tileSize);
        const tileMaterial = new THREE.MeshBasicMaterial({ map: tileTexture, color: 0xffffff });
        const tile = new THREE.Mesh(tileGeometry, tileMaterial);
        tile.rotation.x = -Math.PI / 2;
        tile.position.x = x * tileSize;
        tile.position.z = y * tileSize;

        this.tileGroup.add(tile);
      }
    }

    this.add(this.tileGroup);
  }

  tileSizeInMeters() {
    // Because of the Mercator projection used to create the tile images, the size of a tile (in meters) depends on the latitude
    return 2 * Math.PI * MapObject.EARTH_RADIUS * Math.cos(this.geolocation[0] * Math.PI / 180) / Math.pow(2, MapObject.ZOOM);
  }
}

MapObject.EARTH_RADIUS = 6378137; // meters
MapObject.TILE_PIXELS = 256; // pixels per tile
MapObject.ZOOM = 20;
MapObject.SCALE = 1 << MapObject.ZOOM;
MapObject.HALF_NUM_TILES = 20;
