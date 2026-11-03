// Multiplicador complejo (#366): (ar + j·ai)(br + j·bi), F bits fraccionarios, redondeado y saturado
// (SAT = 1). Para un mezclador I/Q: br, bi del NCO o del CORDIC.
module dsp_cmul #(parameter W = 16, parameter F = 15, parameter SAT = 1) (
  input signed [W-1:0] ar,
  input signed [W-1:0] ai,
  input signed [W-1:0] br,
  input signed [W-1:0] bi,
  output signed [W-1:0] yr,
  output signed [W-1:0] yi
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  localparam signed [2*W+1:0] HALF = F > 0 ? 1 << (F - 1) : 0;
  wire signed [2*W+1:0] pr = ar * br - ai * bi + HALF;
  wire signed [2*W+1:0] pi = ar * bi + ai * br + HALF;
  wire signed [2*W+1:0] qr = pr >>> F;
  wire signed [2*W+1:0] qi = pi >>> F;
  wire or_ = qr[2*W+1:W-1] != {(W+3){qr[2*W+1]}};
  wire oi = qi[2*W+1:W-1] != {(W+3){qi[2*W+1]}};
  assign yr = SAT != 0 && or_ ? (qr[2*W+1] ? MIN : MAX) : qr[W-1:0];
  assign yi = SAT != 0 && oi ? (qi[2*W+1] ? MIN : MAX) : qi[W-1:0];
endmodule
