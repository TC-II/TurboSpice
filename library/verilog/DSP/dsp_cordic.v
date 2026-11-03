// CORDIC en modo rotación (#366): de la fase (16 bits sin signo, la vuelta entera es 2^16) a cos y sen
// en Q1.15, con 16 iteraciones de sumas y corrimientos (la ganancia del CORDIC ya compensada). Para
// un oscilador sin tabla o una rotación de fase.
module dsp_cordic (
  input [15:0] phase,
  output signed [15:0] cos,
  output signed [15:0] sin
);
  // fase en 18 bits (la vuelta, 2^18); se lleva al primer o cuarto cuadrante y se corrige el signo
  reg signed [19:0] x, y, z, xn;
  reg signed [19:0] atan;
  reg flip;
  integer i;
  always @* begin
    z = {2'b00, phase, 2'b00};
    flip = z >= (1 << 16) && z < (3 << 16);
    if (flip) z = z - (1 << 17);
    if (z >= (3 << 16)) z = z - (1 << 18);
    x = 79591;
    y = 0;
    for (i = 0; i < 16; i = i + 1) begin
      case (i)
      0: atan = 32768;
      1: atan = 19344;
      2: atan = 10221;
      3: atan = 5188;
      4: atan = 2604;
      5: atan = 1303;
      6: atan = 652;
      7: atan = 326;
      8: atan = 163;
      9: atan = 81;
      10: atan = 41;
      11: atan = 20;
      12: atan = 10;
      13: atan = 5;
      14: atan = 3;
      15: atan = 1;
        default: atan = 0;
      endcase
      xn = z >= 0 ? x - (y >>> i) : x + (y >>> i);
      y = z >= 0 ? y + (x >>> i) : y - (x >>> i);
      x = xn;
      z = z >= 0 ? z - atan : z + atan;
    end
    if (flip) begin
      x = -x;
      y = -y;
    end
  end
  // (con 2 bits de más adentro; se redondea al salir)
  assign cos = (x + 2) >>> 2;
  assign sin = (y + 2) >>> 2;
endmodule
