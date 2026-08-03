// Federal Furniture logo, embedded so there's no separate image file to host.
// Converted from the supplied Illustrator artwork: the white page background
// was made transparent and the brand colours left exactly as designed.
const LOGO_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFIAAAA4CAMAAABZnV+VAAAAXVBMVEWIyGKg04F9hnh4wEt6sVh9fX16eXt0v0d0v0ZzvkVzvkVyvkVyvkRyvkR1wEd0v0Z7eXt5eXl9fX15eXl4eHhyvkR4eHh6eXp6enp6enp6ent5eHl8fHxyvkR3d3ekXud1AAAAHXRSTlMCBhchHSdBd5eyydvn7F2DYs1I7Mbz5oKki6rYZ4tUyK8AAAK+SURBVFjD7ZeLjqMwDEVJ0vCGxoYGe2fL/3/mOH2M2imEMDPSald7pbYogVMTrh2TZf/1V0tpc7DWHg5Gq+/DDnlRVnXTdkFt29RVWeTmq2Bl+rLuzgtq67I3+4G6r9pzRG3V610B2jLKu6o52mSiLbttYFCp0iI1qcBzpR24BGjfJALPtcFhnkfcWsXylEw8oJ9F3sWfc5kKPDf2SpznwUV8qqsY5PS4xm1uYb5pmFaZKhqjQMT77StRtHrvRYzY5dah1SYvqrprc/NInP3KM7Ixe3d9CMsDOWu0tWacnwTLCRq77VP/ARmAJqT5k3gxyC5CLPQL5Fl+KcxjJMjjFnHxCamIgUrNW8SZFjzZfIs4w6s315ey1hlOBMN+5GpyhyJutbaOR/9DUV5s2VRFrrXBXzuQeruotaXC1TjHhTyvtpH2KbG3vd5vEbs8QpyXsnzrzq9ZvmMpl9KnKz+K2VOWJyZPCLN+Jp56bfQhP1bNaTPLaaUI508+ChBPjMGSfdlHibC6oxePdr+XCilmDk00J31kl3xgPie2hy8SM1V0i8SoYGMnv3UGpZ5SibTZGV36F2lNhjSg55RmM69rk0gctkO8GVRbnwbE9H5YIW9CgXcAr2vqeL2Qi1dxVxP8sQDoCF6iDe3B13j3JTDoHNNNPEkT8/0XlTv7x0j/uhRLZSRmlF/j5NgROYWUKw5FwRI75/RlGpHl4PLMptsYyensPiODMzzLxwGTuJiAQLNnDeFUmZIrDTigkXhmCP8KIzJfxoDojfEFOQouYK14JSC9l9MJ7BUpuXdFgsfpDQakKSPKZMxfxsgvIF1mw7bgSSIAlvtmYE/hAikNCNIXyRTCJBPkZqTfGXEWIkRwI8uW8vJegUYSG9HIR1lEef3W8p1ZOZZU0ZLOCp1VaIzMyY81MncfsxhO+9N+2Kt3ja/mXzqo1bAAAAAASUVORK5CYII=";

export default function Logo({ height = 32 }) {
  return (
    <img
      src={LOGO_SRC}
      alt="Federal Furniture"
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
