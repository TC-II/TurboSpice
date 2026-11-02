// Ganancia ×2^K (#366): K > 0 desplaza a la izquierda (satura si SAT = 1), K < 0 a la derecha
// con signo (trunca hacia −∞).
module dsp_shift #(parameter W = 16, parameter K = 1, parameter SAT = 1) (
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  generate
    if (K >= 0) begin : left
      wire signed [W+K-1:0] s = x <<< K;
      wire ovf = s[W+K-1:W-1] != {(K+1){s[W+K-1]}};
      assign y = SAT != 0 && ovf ? (s[W+K-1] ? MIN : MAX) : s[W-1:0];
    end else begin : right
      assign y = x >>> (-K);
    end
  endgenerate
endmodule
