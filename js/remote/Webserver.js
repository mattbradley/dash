// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash
import { EventEmitter } from "events";
import { readFileSync } from 'fs';
import { createServer } from 'http';
/**
 * Webserver
 */
export default class WebServer {
  /**
   * construct me
   * @param port - the port on which to listen for requests
   */
  constructor(port) {
    this.port=port
  }

  /**
   * start the webserver
   */
  start() {
    var index = fs.readFileSync('index.html');

    http.createServer(function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end(index);
    }).listen(this.port);
  }

  stop() {

  }
  /* this.emitter = new EventEmitter();
  this.videoServer = http.createServer((req, res) => {
    res.writeHead(200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0',
      Pragma: 'no-cache',
      Connection: 'close',
      'Content-Type': 'multipart/x-mixed-replace; boundary=--myboundary'
    });

    const writeFrame = () => {
      const buffer = buffers[bufferIndex];
      res.write(`--myboundary\nContent-Type: image/jpg\nContent-length: ${buffer.length}\n\n`);
      res.write(buffer);
    };

    writeFrame();
    emitter.addListener('frame', writeFrame);
    res.addListener('close', () => {
      emitter.removeListener('frame', writeFrame);
    });
   });
   server.listen(8234); */
}
