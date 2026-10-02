type InstagramLinkProps = {
  className?: string;
};

export default function InstagramLink({ className = "" }: InstagramLinkProps) {
  return (
    <a className={`group inline-flex min-h-12 items-center justify-center gap-3 text-left text-[14px] leading-[1.3] ${className}`} href="https://www.instagram.com/el_solar_timbero/"
      target="_blank" rel="noopener noreferrer">
      <svg
        aria-hidden="true"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      ><rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5"
        /><circle cx="12" cy="12" r="4" /><circle
          cx="17.5"
          cy="6.5"
          r=".8"
          fill="currentColor"
          stroke="none"
        /></svg>
      <span>Follow us on Instagram<strong className="block font-heading text-[25px] uppercase group-hover:underline group-hover:underline-offset-4
        mobile:text-[23px]">@elsolartimbero <span aria-hidden="true"></span></strong></span>
    </a>
  );
}
