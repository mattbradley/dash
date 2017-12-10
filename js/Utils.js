Math.clamp = (number, min, max) => Math.max(min, Math.min(number, max));
Math.wrapAngle = (angle) => {
  angle = angle % (Math.PI * 2);
  if (angle <= -Math.PI) return angle + Math.PI * 2;
  else if (angle > Math.PI) return angle - Math.PI * 2;
  else return angle;
}
THREE.Vector2.fromAngle = (angle) => new THREE.Vector2(Math.cos(angle), Math.sin(angle));
