// CORDIC en modo vectorización (#366): de (x, y) en Q1.15 a la magnitud √(x² + y²) (Q1.15, saturada)
// y la fase (16 bits sin signo, la vuelta entera es 2^16), con 16 iteraciones. Para un detector de
// amplitud y fase de una señal I/Q.
module dsp_magphase (
  input signed [15:0] x,
  input signed [15:0] y,
  output signed [15:0] mag,
  output [15:0] phase
);
  reg signed [19:0] xr, yr, xn;
  reg signed [19:0] z;
  reg signed [19:0] atan;
  reg signed [35:0] m;
  integer i;
  always @* begin
    // al semiplano derecho: x < 0 suma media vuelta
    xr = x[15] ? -x : x;
    yr = x[15] ? -y : y;
    z = x[15] ? (1 << 17) : 0;
    xr = xr <<< 2;
    yr = yr <<< 2;
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
      xn = yr < 0 ? xr - (yr >>> i) : xr + (yr >>> i);
      z = yr < 0 ? z - atan : z + atan;
      yr = yr < 0 ? yr + (xr >>> i) : yr - (xr >>> i);
      xr = xn;
    end
    // la ganancia del CORDIC: × 0.607253
    m = (xr * 39797 + (1 << 17)) >>> 18;
  end
  assign mag = m > 32767 ? 32767 : m[15:0];
  assign phase = z[19:2];
endmodule
