// Detector de envolvente (#366): |x| con un pasabajos de primer orden (y += (|x| − y)/2^K): la
// amplitud de un seno (su valor medio rectificado, 2/π de la amplitud) o la potencia de una señal.
module dsp_envelope #(parameter W = 16, parameter K = 5) (
  input clk,
  input signed [W-1:0] x,
  output reg signed [W-1:0] y
);
  wire signed [W:0] a = x[W-1] ? -x : x;
  wire signed [W+1:0] e = a - y;
  initial y = 0;
  always @(posedge clk) y <= y + (e >>> K);
endmodule
