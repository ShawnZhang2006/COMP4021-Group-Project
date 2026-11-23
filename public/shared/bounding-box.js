// Adapted from COMP4021 Lab 3, gem_rush/bounding_box.js.
// Numeric point tests replace Canvas Path2D so the same box runs on the server.
export function BoundingBox(top, left, bottom, right) {
  const getTop = () => top;
  const getLeft = () => left;
  const getBottom = () => bottom;
  const getRight = () => right;
  const getPoints = () => ({
    topLeft: [left, top], topRight: [right, top],
    bottomLeft: [left, bottom], bottomRight: [right, bottom]
  });
  const isPointInBox = (x, y) => x >= left && x <= right && y >= top && y <= bottom;
  const intersect = box => !(box.getLeft() > right || box.getRight() < left || box.getTop() > bottom || box.getBottom() < top);
  const randomPoint = (random = Math.random) => ({ x: left + random() * (right - left), y: top + random() * (bottom - top) });
  return { getTop, getLeft, getBottom, getRight, getPoints, isPointInBox, intersect, randomPoint };
}
